import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { allowedUrl, digest, policyDigest } from './config.mjs';
import { planVerification } from './planner.mjs';
import { publishVerificationComment } from './pr-comment.mjs';
import { buildReport } from './report.mjs';

export const checkName = 'Midscene / Functional Verification';

export class Controller {
  constructor({
    github,
    store,
    policies,
    runner,
    publicUrl,
    publishEvidence,
    workflowUrl,
    planner = planVerification,
  }) {
    Object.assign(this, {
      github,
      store,
      policies,
      runner,
      publicUrl,
      publishEvidence,
      workflowUrl,
      planner,
    });
  }

  async handle(event, payload, deliveryId) {
    const policy = this.policies.find(
      (item) =>
        item.repository === payload.repository?.full_name &&
        item.installationId === payload.installation?.id,
    );
    if (!policy) return;
    const api = (method, suffix, body) =>
      this.github.api(
        policy.installationId,
        method,
        `/repos/${policy.repository}${suffix}`,
        body,
      );
    let numbers = [];
    let rerun = '';
    if (
      event === 'pull_request' &&
      [
        'opened',
        'synchronize',
        'reopened',
        'ready_for_review',
        'edited',
      ].includes(payload.action)
    ) {
      numbers = [payload.pull_request.number];
    } else if (
      event === 'deployment_status' &&
      payload.deployment_status.state === 'success' &&
      payload.deployment.environment === policy.environment
    ) {
      if (!/^[a-f0-9]{40}$/.test(payload.deployment.sha))
        throw new Error('Invalid deployment revision');
      const pulls = await api(
        'GET',
        `/commits/${payload.deployment.sha}/pulls?per_page=100`,
      );
      numbers = pulls
        .filter(
          (pr) => pr.state === 'open' && pr.head.sha === payload.deployment.sha,
        )
        .map((pr) => pr.number);
    } else if (
      event === 'check_run' &&
      payload.action === 'rerequested' &&
      payload.check_run.name === checkName
    ) {
      const prior = await this.store.get('runs', payload.check_run.external_id);
      if (
        !prior ||
        prior.subject.repository !== policy.repository ||
        prior.checkId !== payload.check_run.id
      )
        return;
      numbers = [prior.subject.pullRequest];
      rerun = deliveryId;
    }
    for (const number of numbers) {
      if (!Number.isSafeInteger(number) || number < 1)
        throw new Error('Invalid PR number');
      await this.verifyPullRequest(policy, api, number, rerun);
    }
  }

  async verifyPullRequest(policy, api, number, rerun) {
    const pr = await api('GET', `/pulls/${number}`);
    if (pr.state !== 'open' || pr.draft) return;
    const sha = pr.head.sha;
    if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid PR revision');
    const id = digest(
      JSON.stringify([
        policy.repository,
        number,
        sha,
        policyDigest(policy),
        rerun,
        ...(policy.planning ? [pr.base?.sha, pr.title, pr.body] : []),
      ]),
    ).slice(7);
    let run = await this.store.get('runs', id);
    if (run?.state === 'completed') return;
    if (!run) {
      run = {
        id,
        state: 'queued',
        subject: {
          repository: policy.repository,
          pullRequest: number,
          headSha: sha,
          ...(pr.base?.sha ? { baseSha: pr.base.sha } : {}),
        },
      };
      await this.store.put('runs', id, run);
    }
    if (!run.checkId) {
      // Recover an API-success / local-write crash without intentionally duplicating a check.
      const checks = await api(
        'GET',
        `/commits/${sha}/check-runs?check_name=${encodeURIComponent(checkName)}&per_page=100`,
      );
      let check = checks.check_runs.find((item) => item.external_id === id);
      if (!check)
        check = await api('POST', '/check-runs', {
          name: checkName,
          head_sha: sha,
          external_id: id,
          status: 'queued',
          output: {
            title: 'Waiting for preview deployment',
            summary: 'No functional verification has passed yet.',
          },
        });
      run.checkId = check.id;
      await this.store.put('runs', id, run);
    }
    const deployments = await api(
      'GET',
      `/deployments?sha=${sha}&environment=${encodeURIComponent(policy.environment)}&per_page=100`,
    );
    // Only inspect the newest deployment. An older success must not mask a newer pending/failed deployment.
    const deployment = deployments
      .filter(
        (item) => item.sha === sha && item.environment === policy.environment,
      )
      .sort((a, b) => b.id - a.id)[0];
    if (!deployment) return;
    const statuses = await api(
      'GET',
      `/deployments/${deployment.id}/statuses?per_page=1`,
    );
    const status = statuses[0];
    if (status?.state !== 'success') return;
    const previewUrl = allowedUrl(status.environment_url, policy).href;
    run.subject = {
      ...run.subject,
      deploymentId: deployment.id,
      deploymentSha: deployment.sha,
      previewUrl,
    };
    const directory = path.join(this.store.root, 'evidence', id);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const reportUrl = `${this.publicUrl}/verifications/${id}/report.html`;
    if (
      policy.planning &&
      !run.planning &&
      !run.report &&
      run.state !== 'running'
    ) {
      await api('PATCH', `/check-runs/${run.checkId}`, {
        status: 'in_progress',
        output: {
          title: 'Planning acceptance from PR context and code',
          summary: `Commit: ${sha}`,
        },
      });
      try {
        run.planning = await this.planner({ api, pr, policy });
      } catch {
        run.planning = {
          plan: {
            schemaVersion: '1.0',
            status: 'error',
            headSha: sha,
            baseSha: pr.base?.sha,
            summary:
              'Context collection or acceptance planning failed. Check App Contents/Issues read permissions and planner configuration.',
            criteria: [],
            questions: [],
            unverified: [],
            limitations: [
              'Planning did not complete; no acceptance claim is available.',
            ],
          },
          executionPolicy: policy,
          context: { headSha: sha, sources: [] },
        };
      }
      await this.store.put('runs', id, run);
    }
    const executionPolicy = run.planning?.executionPolicy ?? policy;
    if (run.planning) {
      for (const [name, value] of [
        ['plan.json', run.planning.plan],
        ['context.json', run.planning.context],
        ['operator-policy.json', policy],
      ]) {
        await writeFile(
          path.join(directory, name),
          JSON.stringify(value, null, 2),
        );
      }
    }
    // Resume publication after a crash without rerunning UI actions.
    if (!run.report) {
      if (run.state === 'running') {
        // A crashed process may have performed side effects. Do not silently replay it.
        run.execution = { status: 'interrupted', criteria: [] };
      } else {
        run.state = 'running';
        await this.store.put('runs', id, run);
        await api('PATCH', `/check-runs/${run.checkId}`, {
          status: 'in_progress',
          output: {
            title: 'Verifying required criteria',
            summary: `Verification ID: ${id}\nCommit: ${sha}`,
          },
        });
        try {
          if (
            run.planning &&
            ['error', 'needs-clarification'].includes(run.planning.plan.status)
          ) {
            run.execution = { status: 'planning-blocked', criteria: [] };
          } else {
            run.execution = await this.runner({
              previewUrl,
              policy: executionPolicy,
              directory,
              headSha: sha,
            });
          }
        } catch {
          run.execution = { status: 'error', criteria: [] };
        }
      }
      const current = await api('GET', `/pulls/${number}`);
      const latestStatuses = await api(
        'GET',
        `/deployments/${deployment.id}/statuses?per_page=1`,
      );
      if (
        latestStatuses[0]?.state !== 'success' ||
        latestStatuses[0]?.environment_url !== status.environment_url
      ) {
        run.execution.status = 'deployment-changed';
      }
      run.report = await buildReport({
        id,
        subject: run.subject,
        policy: executionPolicy,
        planning: run.planning,
        operatorPolicy: policy,
        execution: run.execution,
        directory,
        currentHead: current.state === 'open' ? current.head.sha : '',
        source: 'github-app-runner',
      });
      run.state = 'publishing';
      await this.store.put('runs', id, run);
    }
    await this.publishEvidence?.({ id, directory, report: run.report });
    const current = await api('GET', `/pulls/${number}`);
    const fresh =
      current.state === 'open' &&
      current.head.sha === sha &&
      (!policy.planning ||
        (current.base?.sha === pr.base?.sha &&
          current.title === pr.title &&
          current.body === pr.body));
    const passed = fresh && run.report.functionalGate.status === 'satisfied';
    const conclusion = passed
      ? 'success'
      : !fresh
        ? 'cancelled'
        : policy.planning &&
            (run.planning?.plan.status !== 'ready' ||
              run.report.execution.status !== 'completed')
          ? 'action_required'
          : 'failure';
    await api('PATCH', `/check-runs/${run.checkId}`, {
      status: 'completed',
      conclusion,
      completed_at: new Date().toISOString(),
      details_url:
        run.report.criteria.length === 1 &&
        run.report.criteria[0].evidence.includes(
          `${run.report.criteria[0].id}.midscene.html`,
        )
          ? `${this.publicUrl}/verifications/${id}/${run.report.criteria[0].id}.midscene.html`
          : reportUrl,
      output: {
        title: passed
          ? 'Required functional criteria passed'
          : fresh
            ? 'Functional verification not satisfied'
            : 'Superseded PR revision',
        summary: [
          `Commit: ${sha}`,
          `Verification ID: ${id}`,
          `Required criteria: ${run.report.coverage.passed}/${run.report.coverage.required} passed.`,
          `Execution: ${run.report.execution.status}${run.report.execution.errorCode ? ` (${run.report.execution.errorCode})` : ''}`,
          ...run.report.functionalGate.blockingReasons.map(
            (item) =>
              `${item.code}${item.criterionId ? `: ${item.criterionId}` : ''}`,
          ),
          `[Agent result](${this.publicUrl}/verifications/${id}/verdict.json)`,
          `[Evidence manifest](${this.publicUrl}/verifications/${id}/manifest.json)`,
          'Reports and evidence are publicly readable without a password. Other repository merge requirements still apply.',
        ].join('\n\n'),
      },
    });
    await publishVerificationComment({
      api,
      run,
      appId: this.github.appId,
      conclusion,
      publicUrl: this.publicUrl,
      workflowUrl: this.workflowUrl,
    });
    run.state = 'completed';
    await this.store.put('runs', id, run);
  }
}

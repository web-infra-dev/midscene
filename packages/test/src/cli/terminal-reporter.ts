import { stripVTControlCharacters } from 'node:util';
import type { TestRunReportMetrics } from '@midscene/core';
import type {
  CaseRunOutcome,
  CaseRunResult,
  StepExecutionInfo,
} from '@midscene/core/internal/test-runner';
import type { ConsoleLogEntry } from '@midscene/shared/logger';
import chalk from 'chalk';
import stringWidth from 'string-width';
import { version } from '../../package.json';
import { formatCliError } from './error-format';
import { type CliFailureContext, formatFailureDetails } from './failure-format';
import { CliModelUsage, formatModelUsage } from './model-usage';
import type { TestReporterEvent } from './reporter-events';
import { TerminalProgress, truncateTerminalLine } from './terminal-progress';
import type {
  TestExecutionProjectRunResult,
  TestProjectRunResult,
} from './types';
import {
  formatWarning,
  formatWarningScope,
  warningKey,
} from './warning-format';

export type TerminalReporterMode = 'default' | 'verbose';
export interface ReporterIO {
  log(message: string): void;
  error(message: string): void;
  write?(message: string): void;
  isTTY?: boolean;
  columns?: number;
  rows?: number;
  onResize?(listener: () => void): () => void;
}
const oneLine = (value: string) =>
  stripVTControlCharacters(value).replace(/\s+/g, ' ').trim();
export const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
};
const identity = (project: string, path: string, name?: string) =>
  `[${oneLine(project)}] ${oneLine(path)}${name ? ` › ${oneLine(name)}` : ''}`;
const projectPhaseLabel = (phase: 'setup' | 'teardown') =>
  phase === 'setup' ? 'setting up' : 'cleaning up';
interface FileState {
  projectName: string;
  sourcePath: string;
  total: number;
  outcomes: Map<string, CaseRunOutcome>;
  attemptOutcomes: Map<string, CaseRunOutcome>;
  started: boolean;
  printed: boolean;
  status?: 'success' | 'failed' | 'not-run';
  durationMs: number;
  retries: number;
  completionOrder: number;
}
interface ActiveTask {
  file: FileState;
  name?: string;
  step?: string;
  since: number;
  attempt: number;
  maxAttempts?: number;
  runId?: string;
  phase?: string;
  stepIndex?: number;
  caseIndex?: number;
  warning?: string;
}
type LiveChild =
  | { outcome: CaseRunOutcome }
  | { task: ActiveTask }
  | { summary: string; failed: boolean };
type LiveMode = 'full' | 'recent' | 'compact' | 'active';

// Document status describes its lifecycle; failed Cases must also fail the file.
const fileStatus = (
  status: FileState['status'],
  cases: readonly CaseRunOutcome[],
): FileState['status'] => {
  if (status === 'failed' || cases.some((item) => item.status === 'failed'))
    return 'failed';
  if (cases.length && cases.every((item) => item.status === 'not-run'))
    return 'not-run';
  if (cases.some((item) => item.status === 'not-run')) return 'failed';
  return status ?? (cases.length ? 'success' : 'not-run');
};

export class TerminalReporter {
  private total = 0;
  private completionOrder = 0;
  private totalFiles = 0;
  private files = new Map<string, FileState>();
  private warnings = new Map<string, { scope: string; message: string }>();
  private latestNotice?: string;
  private usage = new CliModelUsage();
  private finalMetrics?: TestRunReportMetrics;
  private attempts = new Map<string, { run: CaseRunResult; max: number }>();
  private active = new Map<string, ActiveTask>();
  private projectPhases = new Map<
    string,
    { phase: 'setup' | 'teardown'; since: number }
  >();
  private failures: {
    source: string;
    error: unknown;
    context?: CliFailureContext;
  }[] = [];
  private lastOutput = Date.now();
  private startedAt = Date.now();
  private timer?: ReturnType<typeof setInterval>;
  private scheduled?: ReturnType<typeof setTimeout>;
  private progressView: TerminalProgress;
  private removeResizeListener?: () => void;
  private color;

  constructor(
    private io: ReporterIO,
    readonly mode: TerminalReporterMode = 'default',
  ) {
    this.progressView = new TerminalProgress(io);
    this.color = new chalk.Instance({
      level: io.isTTY && !process.env.NO_COLOR ? 1 : 0,
    });
  }
  private get interactive(): boolean {
    return !!this.io.isTTY && !!this.io.write && this.mode === 'default';
  }
  private log(message: string): void {
    if (this.interactive)
      this.output(`${message}\n`, (text) => this.io.write!(text));
    else this.io.log(message);
    this.lastOutput = Date.now();
  }
  /** Called only by the standalone CLI's scoped stdout/stderr capture. */
  output(message: string, write: (message: string) => void): void {
    this.renderProgress(false);
    this.progressView.output(message, write);
    this.lastOutput = Date.now();
  }
  progress(message: string): void {
    if (this.mode === 'verbose') this.log(message);
  }
  console(entry: ConsoleLogEntry): void {
    if (entry.type === 'report') {
      if (this.mode === 'verbose') this.log(entry.message);
      return;
    }
    const scope = formatWarningScope(entry.scope);
    if (this.mode === 'verbose') {
      const kind =
        entry.warning?.kind === 'model-request-retry'
          ? 'model request retry · '
          : entry.warning?.kind === 'model-request-detail'
            ? 'model request error · '
            : '';
      this.log(`WARN ${scope}${kind}${entry.message}`);
      return;
    }
    // The request retry notice carries this failure once; terminal failures
    // are presented with their Case result and final failure details.
    if (entry.warning?.kind === 'model-request-detail') return;
    const message = formatWarning(entry);
    const key = warningKey(entry, message);
    if (this.warnings.has(key)) return;
    this.warnings.set(key, { scope, message });
    if (this.interactive) {
      let attached = false;
      if (entry.warning?.kind === 'model-request-retry' && entry.scope) {
        const owner = entry.scope;
        for (const [id, task] of this.active) {
          if (
            task.file.projectName !== owner.projectName ||
            (owner.sourcePath && task.file.sourcePath !== owner.sourcePath) ||
            (owner.caseId && id !== owner.caseId) ||
            (owner.runId && task.runId !== owner.runId) ||
            (owner.phase && task.phase !== owner.phase) ||
            (owner.stepIndex !== undefined &&
              task.stepIndex !== owner.stepIndex)
          )
            continue;
          task.warning = message;
          attached = true;
        }
      }
      if (!attached)
        this.latestNotice = message.startsWith('Playwright:')
          ? 'Playwright: network-idle wait skipped.'
          : `${scope}${message}`;
      this.schedule();
      return;
    }
    this.log(`${this.color.yellow('WARN')} ${this.color.dim(scope)}${message}`);
  }

  private file(projectName: string, sourcePath: string, total = 0): FileState {
    const key = `${projectName}\0${sourcePath}`;
    let file = this.files.get(key);
    if (!file) {
      file = {
        projectName,
        sourcePath,
        total,
        outcomes: new Map(),
        attemptOutcomes: new Map(),
        started: false,
        printed: false,
        durationMs: 0,
        retries: 0,
        completionOrder: 0,
      };
      this.files.set(key, file);
    }
    file.total = Math.max(file.total, total);
    return file;
  }

  event(event: TestReporterEvent): void {
    if (event.type === 'run-start') {
      this.total = event.cases;
      this.totalFiles = event.documents;
      this.startedAt = event.startedAt
        ? Date.parse(event.startedAt)
        : Date.now();
      for (const file of event.files ?? [])
        this.file(file.projectName, file.sourcePath, file.cases);
      const c = this.color;
      this.log(
        `\n ${c.bgGreen.black.bold(' RUN ')} ${c.green(`midscene-test v${version}`)} ${c.dim(oneLine(event.projectRoot ?? process.cwd()))}`,
      );
      this.log(
        ` ${c.dim(`${event.projects} projects · ${event.documents} files · ${event.cases} cases`)}`,
      );
      if (
        event.maxConcurrentProjects !== undefined &&
        event.maxConcurrentFiles !== undefined
      )
        this.log(
          ` ${c.dim(`Concurrency ${event.maxConcurrentProjects ?? 'unlimited'} projects · ${event.maxConcurrentFiles ?? 'unlimited'} files (global limits)`)}`,
        );
      if (event.configPath)
        this.log(` ${c.dim(`Config ${oneLine(event.configPath)}`)}`);
      for (const model of event.configuredModels ?? [])
        this.log(
          ` ${c.dim('Models (env)')} ${oneLine(model.name)} ${c.dim(`· ${model.intents.map(oneLine).join(', ')}`)}`,
        );
      this.log('');
      if (this.mode === 'default') {
        this.timer = setInterval(
          () => this.tick(),
          this.interactive ? 1000 : 30_000,
        );
        this.timer.unref();
        if (this.interactive)
          this.removeResizeListener = this.io.onResize?.(() =>
            this.renderProgress(),
          );
        this.renderProgress();
      }
    } else if (event.type === 'project-end') {
      this.completeProject(event.project);
      this.schedule();
    } else if (event.type === 'project-phase') {
      if (event.phase === 'running')
        this.projectPhases.delete(event.projectName);
      else
        this.projectPhases.set(event.projectName, {
          phase: event.phase,
          since: Date.now(),
        });
      this.schedule();
    } else if (event.type === 'document-start') {
      this.file(event.projectName, event.sourcePath, event.cases).started =
        true;
      this.schedule();
    } else if (event.type === 'document-end') {
      const file = this.file(
        event.document.projectName,
        event.document.sourcePath,
        event.cases.length,
      );
      file.status = fileStatus(event.document.status, event.cases);
      file.started = true;
      file.completionOrder = ++this.completionOrder;
      file.durationMs = event.durationMs;
      file.retries = event.document.attemptIndex ?? 0;
      file.outcomes = new Map(
        event.cases.map((outcome) => [outcome.caseId, outcome]),
      );
      file.attemptOutcomes.clear();
      for (const [key, task] of this.active)
        if (task.file === file) this.active.delete(key);
      if (!this.interactive) this.printFile(file);
      this.schedule();
    } else if (event.type === 'step-start') {
      this.startStep(event.projectName, event.info);
    } else if (event.type === 'step-end') {
      if (event.result) this.usage.add(event.result);
      const key =
        event.info.scope === 'case'
          ? event.info.case.caseId
          : event.info.document.documentId;
      const task = this.active.get(key);
      if (task) {
        if (event.info.scope === 'document') this.active.delete(key);
        else {
          task.step = undefined;
          task.warning = undefined;
        }
      }
      this.schedule();
    } else if (event.type === 'case-attempt-end') {
      this.attempts.set(event.attempt.caseId, {
        run: event.attempt,
        max: event.maxAttempts,
      });
    } else if (event.type === 'case-end' || event.type === 'case-progress') {
      const file = this.file(
        event.outcome.projectName,
        event.outcome.sourcePath,
      );
      if (event.type === 'case-progress') {
        file.attemptOutcomes.set(event.outcome.caseId, event.outcome);
        file.retries = Math.max(file.retries, event.documentAttemptIndex);
      } else {
        file.attemptOutcomes.delete(event.outcome.caseId);
        file.outcomes.set(event.outcome.caseId, event.outcome);
        file.retries = Math.max(file.retries, event.documentRetries ?? 0);
      }
      this.active.delete(event.outcome.caseId);
      this.schedule();
    } else if (event.type === 'document-retry') {
      const file = this.file(
        event.document.projectName,
        event.document.sourcePath,
      );
      file.outcomes.clear();
      file.attemptOutcomes.clear();
      file.status = undefined;
      file.completionOrder = 0;
      for (const [key, task] of this.active)
        if (task.file === file) this.active.delete(key);
      this.log(
        this.color.yellow(
          ` ↻ ${identity(file.projectName, file.sourcePath)} · file retry ${(event.document.attemptIndex ?? 0) + 2}/${event.maxAttempts}`,
        ),
      );
      this.schedule();
    }
  }

  private startStep(projectName: string, info: StepExecutionInfo): void {
    const position = info.scope === 'case' ? info.case : info.document;
    const file = this.file(projectName, position.sourcePath);
    file.started = true;
    const key =
      info.scope === 'case' ? info.case.caseId : info.document.documentId;
    const attempt = info.scope === 'case' ? info.case.attemptIndex : 0;
    const previous = this.attempts.get(key);
    if (previous && previous.run.attemptIndex < attempt) {
      this.attempts.delete(key);
      if (this.mode === 'default' && !this.interactive)
        this.log(
          this.color.yellow(
            ` ↻ ${identity(projectName, position.sourcePath, info.scope === 'case' ? info.case.name : undefined)} · case retry · attempt ${attempt + 1}/${previous.max}`,
          ),
        );
    }
    const existing = this.active.get(key);
    const now = Date.now();
    this.active.set(key, {
      file,
      name: info.scope === 'case' ? info.case.name : undefined,
      step: `${position.phase === 'steps' ? 'step' : position.phase} ${position.stepIndex + 1}/${info.stepCount} · ${oneLine(info.node)}`,
      since: existing?.attempt === attempt ? existing.since : now,
      attempt,
      maxAttempts: previous?.max ?? existing?.maxAttempts,
      runId:
        info.scope === 'case' ? info.case.runId : info.document.documentRunId,
      phase: position.phase,
      stepIndex: position.stepIndex,
      caseIndex: info.scope === 'case' ? info.case.caseIndex : undefined,
    });
    this.schedule();
  }

  private schedule(): void {
    if (!this.interactive || !this.timer || this.scheduled) return;
    this.scheduled = setTimeout(() => {
      this.scheduled = undefined;
      this.renderProgress();
    }, 100);
    this.scheduled.unref();
  }
  private counts(items: readonly { status?: string }[], total: number): string {
    const failed = items.filter((item) => item.status === 'failed').length;
    const passed = items.filter((item) => item.status === 'success').length;
    const notRun = items.filter((item) => item.status === 'not-run').length;
    return this.stateCounts(passed, failed, notRun, total);
  }
  private stateCounts(
    passed: number,
    failed: number,
    notRun: number,
    total: number,
  ): string {
    const c = this.color;
    return (
      [
        failed ? c.red.bold(`${failed} failed`) : '',
        c.green.bold(`${passed} passed`),
        notRun ? c.yellow(`${notRun} not run`) : '',
      ]
        .filter(Boolean)
        .join(c.dim(' | ')) + c.dim(` (${total})`)
    );
  }
  private footer(
    durationMs = Date.now() - this.startedAt,
    result?: TestProjectRunResult,
  ): string[] {
    const files = [...this.files.values()];
    const cases = files.flatMap((file) => [...file.outcomes.values()]);
    const c = this.color;
    const metrics = result ? this.finalMetrics : this.usage.snapshot();
    return [
      ` ${c.dim('Test Files')} ${this.counts(files, this.totalFiles)}`,
      ` ${c.dim('     Cases')} ${result ? this.stateCounts(result.summary.passed, result.summary.failed, result.summary.notRun, result.summary.total) : this.counts(cases, this.total)}`,
      ` ${c.dim('  Start at')} ${new Date(this.startedAt).toLocaleTimeString('en-GB', { hour12: false })}`,
      ` ${c.dim('  Duration')} ${formatDuration(durationMs)}`,
      ...formatModelUsage(metrics).map(
        (model, index) =>
          ` ${c.dim(index ? '          ' : '   Models:')} ${model}`,
      ),
      ...(!result || this.warnings.size
        ? [
            ` ${c.dim('  Warnings')} ${this.warnings.size ? c.yellow(String(this.warnings.size)) : c.dim('0')}${!result && this.latestNotice ? c.dim(` · ${this.latestNotice}`) : ''}`,
          ]
        : []),
    ];
  }
  private renderProgress(render = true): void {
    if (!this.interactive || !this.timer) return;
    const projects = new Map<string, FileState[]>();
    const files = [...this.files.values()]
      .filter((file) => file.started && !file.printed)
      .sort(
        (a, b) =>
          a.projectName.localeCompare(b.projectName) ||
          a.sourcePath.localeCompare(b.sourcePath),
      );
    for (const file of files) {
      const group = projects.get(file.projectName) ?? [];
      group.push(file);
      projects.set(file.projectName, group);
    }
    for (const projectName of this.projectPhases.keys())
      if (!projects.has(projectName)) projects.set(projectName, []);
    const footer = this.footer();
    const budget = Math.max(0, (this.io.rows ?? 24) - 2 - footer.length - 1);
    let lines = this.liveTree(projects, 'full');
    if (lines.length > budget) lines = this.liveTree(projects, 'recent');
    if (lines.length > budget) lines = this.liveTree(projects, 'compact');
    if (lines.length > budget) lines = this.liveTree(projects, 'active');
    if (lines.length) lines.push('');
    if (render) this.progressView.render(lines, footer);
    else this.progressView.update(lines, footer);
  }

  private liveTree(
    projects: Map<string, FileState[]>,
    mode: LiveMode,
  ): string[] {
    const c = this.color;
    const lines: string[] = [];
    const groups = [...projects];
    const isActive = ([projectName, files]: [string, FileState[]]) =>
      this.projectPhases.has(projectName) || files.some((file) => !file.status);
    if (mode !== 'full')
      groups.sort((a, b) => Number(isActive(b)) - Number(isActive(a)));
    for (const [projectName, files] of groups) {
      const phase = this.projectPhases.get(projectName);
      const running = files.filter((file) => !file.status);
      const completed = files.filter((file) => file.status);
      const recent = [...completed]
        .sort((a, b) => b.completionOrder - a.completionOrder)
        .slice(0, mode === 'recent' ? 1 : 0);
      const visible = mode === 'full' ? files : [...running, ...recent];
      const hidden = completed.filter((file) => !visible.includes(file));
      const hiddenFailures = hidden.filter(
        (file) => file.status === 'failed',
      ).length;
      const details = [
        phase
          ? c.yellow(
              `${projectPhaseLabel(phase.phase)} ${formatDuration(Date.now() - phase.since)}`,
            )
          : '',
        c.yellow(
          `${running.length} ${running.length === 1 ? 'file' : 'files'} running`,
        ),
        completed.length ? c.dim(`${completed.length} completed`) : '',
        mode === 'active' && hiddenFailures
          ? c.red(`${hiddenFailures} failed`)
          : '',
      ].filter(Boolean);
      lines.push(
        this.liveRow(
          ` ${c.yellow('❯')} ${c.bold(oneLine(projectName))}`,
          c.dim(' · ') + details.join(c.dim(' · ')),
        ),
      );
      for (const [fileIndex, file] of visible.entries()) {
        const lastFile =
          fileIndex === visible.length - 1 &&
          (!hidden.length || mode === 'active');
        const stem = lastFile ? '      ' : `   ${c.dim('│')}  `;
        const outcomes = [
          ...new Map([...file.attemptOutcomes, ...file.outcomes]).values(),
        ].sort((a, b) => a.caseIndex - b.caseIndex);
        const failedCases = outcomes.filter(
          (outcome) => outcome.status === 'failed',
        ).length;
        lines.push(
          this.liveRow(
            `   ${c.dim(lastFile ? '└─' : '├─')} ${file.status ? `${this.statusSymbol(file.status)} ` : ''}${oneLine(file.sourcePath)}`,
            ` ${c.dim(`${outcomes.length}/${file.total} cases`)}${file.status ? c.dim(` ${formatDuration(file.durationMs)}`) : ''}${mode === 'active' && failedCases ? c.red(` · ${failedCases} failed`) : ''}`,
          ),
        );
        const tasks = [...this.active.values()].filter(
          (task) => task.file === file,
        );
        const shown =
          mode === 'full'
            ? outcomes
            : mode === 'recent'
              ? outcomes.slice(-1)
              : [];
        const children: LiveChild[] = [
          ...tasks.map((task) => ({ task })),
          ...shown.map((outcome) => ({ outcome })),
        ];
        if (mode === 'full')
          children.sort(
            (a, b) => this.liveChildIndex(a) - this.liveChildIndex(b),
          );
        const hiddenCases = outcomes.filter(
          (outcome) => !shown.includes(outcome),
        );
        if (hiddenCases.length && mode !== 'active') {
          const failed = hiddenCases.filter(
            (outcome) => outcome.status === 'failed',
          ).length;
          children.push({
            summary: `… ${hiddenCases.length} completed ${hiddenCases.length === 1 ? 'case' : 'cases'}${failed ? ` · ${failed} failed` : ''}`,
            failed: failed > 0,
          });
        }
        for (const [index, child] of children.entries()) {
          const last = index === children.length - 1;
          const prefix = `${stem}${c.dim(last ? '└─' : '├─')} `;
          if ('outcome' in child) {
            lines.push(
              this.liveRow(
                `${prefix}${this.formatCaseResult(child.outcome, file.retries)}`,
                '',
              ),
            );
            continue;
          }
          if ('summary' in child) {
            lines.push(
              this.liveRow(
                `${prefix}${child.failed ? c.red(child.summary) : c.dim(child.summary)}`,
                '',
              ),
            );
            continue;
          }
          const { task } = child;
          const hint =
            task.name && task.step
              ? truncateTerminalLine(
                  ` · ${task.step}`,
                  Math.floor(Math.max(0, (this.io.columns ?? 100) - 1) / 2),
                )
              : '';
          const retry = task.attempt
            ? ` · attempt ${task.attempt + 1}${task.maxAttempts ? `/${task.maxAttempts}` : ''}`
            : '';
          lines.push(
            this.liveRow(
              `${prefix}${oneLine(task.name ?? task.step ?? 'file lifecycle')}`,
              `${c.dim(hint)} ${c.yellow(formatDuration(Date.now() - task.since))}${c.yellow(retry)}`,
            ),
          );
          if (task.warning)
            lines.push(
              this.liveRow(
                `${stem}${last ? '   ' : `${c.dim('│')}  `}${c.dim('└─')} ${c.yellow(`⚠ ${task.warning}`)}`,
                '',
              ),
            );
        }
      }
      if (hidden.length && mode !== 'active') {
        const summary = `… ${hidden.length} completed ${hidden.length === 1 ? 'file' : 'files'}${hiddenFailures ? ` · ${hiddenFailures} failed` : ''}`;
        lines.push(
          this.liveRow(
            `   ${c.dim('└─')} ${hiddenFailures ? c.red(summary) : c.dim(summary)}`,
            '',
          ),
        );
      }
    }
    return lines;
  }

  private liveChildIndex(child: LiveChild): number {
    if ('outcome' in child) return child.outcome.caseIndex;
    if ('summary' in child) return Number.MAX_SAFE_INTEGER;
    return (
      child.task.caseIndex ??
      (child.task.phase === 'beforeAll' ? -1 : Number.MAX_SAFE_INTEGER)
    );
  }

  private liveRow(label: string, suffix: string): string {
    const columns = Math.max(0, (this.io.columns ?? 100) - 1);
    const tail = truncateTerminalLine(suffix, columns);
    return truncateTerminalLine(label, columns - stringWidth(tail)) + tail;
  }
  private tick(): void {
    if (this.interactive) {
      this.renderProgress();
      return;
    }
    if (
      (this.active.size || this.projectPhases.size) &&
      Date.now() - this.lastOutput >= 30_000
    )
      this.log(
        `… Still running: ${[
          ...[...this.projectPhases].map(
            ([projectName, phase]) =>
              `[${oneLine(projectName)}] · ${projectPhaseLabel(phase.phase)} (${formatDuration(Date.now() - phase.since)})`,
          ),
          ...[...this.active.values()].map(
            (task) =>
              `${identity(task.file.projectName, task.file.sourcePath, task.name)} · ${task.step ?? 'between steps'} (${formatDuration(Date.now() - task.since)})`,
          ),
        ].join(' | ')}`,
      );
  }

  private formatCaseResult(
    outcome: CaseRunOutcome,
    documentRetries: number,
  ): string {
    const c = this.color;
    const attempts = outcome.attempts ?? (outcome.run ? [outcome.run] : []);
    const retries = Math.max(
      attempts.length - 1,
      outcome.run?.attemptIndex ?? 0,
    );
    const duration = formatDuration(
      attempts.reduce((sum, attempt) => sum + attempt.durationMs, 0),
    );
    const symbol =
      outcome.status === 'success'
        ? c.green('✓')
        : outcome.status === 'failed'
          ? c.red('×')
          : c.yellow('–');
    const detail =
      outcome.status === 'not-run'
        ? c.dim(` · ${outcome.notRunReason ?? 'not run'}`)
        : ` ${c.dim(duration)}${retries ? c.yellow(` · ${outcome.status === 'success' ? 'passed after retry' : 'failed after retries'} (${retries + 1} attempts)`) : documentRetries ? c.yellow(` · file retried ${documentRetries}x`) : ''}`;
    return `${symbol} ${oneLine(outcome.name)}${detail}`;
  }
  private statusSymbol(status: FileState['status']): string {
    return status === 'failed'
      ? this.color.red('×')
      : status === 'not-run'
        ? this.color.yellow('–')
        : this.color.green('✓');
  }

  private resultFileLines(file: FileState, lastFile: boolean): string[] {
    const c = this.color;
    const stem = lastFile ? '      ' : `   ${c.dim('│')}  `;
    const cases = [...file.outcomes.values()].sort(
      (a, b) => a.caseIndex - b.caseIndex,
    );
    const failed = cases.filter((item) => item.status === 'failed').length;
    const notRun = cases.filter((item) => item.status === 'not-run').length;
    const stats = `(${cases.length} cases${failed ? ` | ${failed} failed` : ''}${notRun ? ` | ${notRun} not run` : ''})`;
    return [
      `   ${c.dim(lastFile ? '└─' : '├─')} ${this.statusSymbol(file.status)} ${c.bold(oneLine(file.sourcePath))} ${c.dim(stats)} ${c.dim(formatDuration(file.durationMs))}`,
      ...cases.map(
        (item, caseIndex) =>
          `${stem}${c.dim(caseIndex === cases.length - 1 ? '└─' : '├─')} ${this.formatCaseResult(item, file.retries)}`,
      ),
    ];
  }

  private printFile(file: FileState): void {
    if (file.printed) return;
    file.printed = true;
    this.log(
      [
        '',
        ` ${this.color.bold(oneLine(file.projectName))}`,
        ...this.resultFileLines(file, true),
      ].join('\n'),
    );
  }

  private printProject(
    projectName: string,
    files: readonly FileState[],
    failed: boolean,
  ): void {
    if (!files.length || files.every((file) => file.printed)) return;
    const c = this.color;
    const status =
      failed || files.some((file) => file.status === 'failed')
        ? 'failed'
        : files.every((file) => file.status === 'not-run')
          ? 'not-run'
          : files.some((file) => file.status === 'not-run')
            ? 'failed'
            : 'success';
    const lines = [
      '',
      ` ${this.statusSymbol(status)} ${c.bold(oneLine(projectName))} ${c.dim(`(${files.length} ${files.length === 1 ? 'file' : 'files'})`)}`,
    ];
    for (const [index, file] of files.entries()) {
      if (file.printed) continue;
      file.printed = true;
      lines.push(...this.resultFileLines(file, index === files.length - 1));
    }
    this.log(lines.join('\n'));
  }

  failure(source: string, error: unknown, context?: CliFailureContext): void {
    this.failures.push({ source, error, context });
  }

  private completeProject(project: TestExecutionProjectRunResult): void {
    this.projectPhases.delete(project.name);
    const projectFiles = new Set<FileState>();
    const documents = new Map(
      project.documents.map((document) => [document.documentId, document]),
    );
    const resultSources = new Set([
      ...project.cases.map((outcome) => outcome.sourcePath),
      ...project.documents.map((document) => document.sourcePath),
      ...project.collectionErrors.map((error) => error.sourcePath),
    ]);
    // Preserve plan order for selected files and actual results, excluding
    // files whose Cases were all filtered out before execution.
    for (const plan of project.plans ?? []) {
      const selected = plan.cases.filter((item) => item.selected).length;
      if (selected || resultSources.has(plan.sourcePath))
        projectFiles.add(this.file(project.name, plan.sourcePath, selected));
    }
    for (const outcome of project.cases)
      this.file(project.name, outcome.sourcePath).outcomes.set(
        outcome.caseId,
        outcome,
      );
    for (const document of documents.values()) {
      const file = this.file(project.name, document.sourcePath);
      file.status = document.status;
      file.retries = document.attemptIndex ?? 0;
      file.durationMs = project.documents
        .filter((item) => item.documentId === document.documentId)
        .reduce((sum, item) => sum + item.durationMs, 0);
    }
    for (const error of project.collectionErrors)
      this.file(project.name, error.sourcePath).status = 'failed';
    for (const file of this.files.values())
      if (file.projectName === project.name) {
        file.attemptOutcomes.clear();
        const cases = [...file.outcomes.values()];
        file.status = fileStatus(file.status, cases);
        projectFiles.add(file);
      }
    for (const [key, task] of this.active)
      if (task.file.projectName === project.name) this.active.delete(key);
    if (this.interactive)
      this.printProject(
        project.name,
        [...projectFiles],
        project.status === 'failed',
      );
    else for (const file of projectFiles) this.printFile(file);
  }

  finish(result: TestProjectRunResult): void {
    this.dispose();
    this.finalMetrics = result.metrics ?? this.usage.snapshot();
    if (result.startedAt) this.startedAt = Date.parse(result.startedAt);
    for (const project of result.projects) this.completeProject(project);
    this.total = result.summary.total;
    this.totalFiles = this.files.size;
  }

  private sectionHeading(label: string, kind: 'warning' | 'failure'): void {
    const c = this.color;
    const width = Math.max(0, (this.io.columns ?? 80) - 2);
    const title = truncateTerminalLine(` ${label} `, width);
    const padding = Math.max(0, width - stringWidth(title));
    const left = Math.floor(padding / 2);
    const line = kind === 'warning' ? c.yellow : c.red;
    const badge =
      kind === 'warning' ? c.bgYellow.black.bold : c.bgRed.white.bold;
    this.log(
      `\n ${line('─'.repeat(left))}${badge(title)}${line('─'.repeat(padding - left))}\n`,
    );
  }

  summary(result: TestProjectRunResult): void {
    const c = this.color;
    if (this.interactive && this.warnings.size) {
      this.sectionHeading(`Warnings ${this.warnings.size}`, 'warning');
      for (const warning of [...this.warnings.values()].slice(0, 5))
        this.log(
          ` ${c.yellow('WARN')} ${c.dim(warning.scope)}${warning.message}`,
        );
      if (this.warnings.size > 5)
        this.log(
          c.dim(
            ` … ${this.warnings.size - 5} more warnings; see debug logs or --reporter verbose.`,
          ),
        );
    }
    if (this.failures.length) {
      this.sectionHeading(`Failures ${this.failures.length}`, 'failure');
      for (const failure of this.failures) {
        if (this.mode === 'default') {
          const detail = formatFailureDetails(
            failure.source,
            failure.error,
            failure.context,
          );
          const body = detail.body
            .map((line) => {
              if (line.startsWith('  Error:')) return c.red(line);
              if (line.startsWith('  at ')) return c.dim(line);
              return line.replace(
                /^ {2}(?:Step|Location|Attempt|File try|Phase|Input)\s+/,
                (label) => c.dim(label),
              );
            })
            .join('\n');
          const block = `${c.bgRed.white.bold(' FAIL ')} ${c.bold(detail.title)}\n${body}\n`;
          if (this.interactive) this.log(block);
          else
            this.io.error(`FAIL ${detail.title}\n${detail.body.join('\n')}\n`);
          continue;
        }
        const message = formatCliError(failure.error);
        this.io.error(
          `FAIL midscene-test: ${failure.source}:\n${message
            .split('\n')
            .map((line) => `  ${line}`)
            .join('\n')}\n`,
        );
      }
    }
    this.log(`\n${this.footer(result.durationMs, result).join('\n')}`);
    this.log('');
    this.failures = [];
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.scheduled) clearTimeout(this.scheduled);
    this.timer = undefined;
    this.scheduled = undefined;
    this.removeResizeListener?.();
    this.removeResizeListener = undefined;
    this.progressView.clear();
  }
}

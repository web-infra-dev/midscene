import { RecordTimeline } from '@midscene/recorder';
import type { StudioRecorderCodeType } from '@shared/electron-contract';
import type { ReactNode } from 'react';
import type { StudioRecordingSession } from '../../recorder/types';
import {
  ArrowIcon,
  BackIcon,
  CheckIcon,
  CodeIcon,
  CopyIcon,
  DownloadIcon,
  RecorderOutputIcon,
  ReloadIcon,
  TimelineIcon,
} from './assets/recorder-icons';
import {
  LANGUAGE_OPTIONS,
  type StudioRecorderGenerationState,
  type StudioRecorderKnowledgeGenerationState,
  type StudioRecorderTab,
  codeTypeLabel,
  generatingText,
  getGenerationSteps,
  isPlaywrightAvailable,
  platformLabel,
} from './recorder-panel-utils';

interface RecorderDetailViewProps {
  activeCode: string;
  activeCodeType: StudioRecorderCodeType;
  activeTab: StudioRecorderTab;
  codeLabel: string;
  detailSession: StudioRecordingSession | null;
  fallback: ReactNode;
  generation: StudioRecorderGenerationState;
  isGenerating: boolean;
  isKnowledgeGenerating: boolean;
  knowledgeGeneration: StudioRecorderKnowledgeGenerationState;
  knowledgeMarkdown: string;
  onBackToList: () => void;
  onCodeTabClick: () => void;
  onCodeTypeChange: (type: StudioRecorderCodeType) => void;
  onCopyCode: () => void;
  onExportCode: () => void;
  onExportKnowledge: (format: 'markdown' | 'json') => void;
  onGenerateKnowledge: () => void;
  onKnowledgeTabClick: () => void;
  onLanguageChange: (language: string) => void;
  onCopyKnowledge: () => void;
  onRegenerateCode: () => void;
  onRegenerateKnowledge: () => void;
  onTabChange: (tab: StudioRecorderTab) => void;
  selectedLanguage: string;
}

function RecorderGenerationStatus({
  detailSession,
  generation,
}: {
  detailSession: StudioRecordingSession | null;
  generation: StudioRecorderGenerationState;
}) {
  if (!detailSession || generation.sessionId !== detailSession.id) {
    return null;
  }
  if (generation.status !== 'generating') {
    return null;
  }

  if (generation.steps.code.status === 'loading') {
    return (
      <div className="studio-recorder-generating-card">
        <span>{generatingText(generation.type)}</span>
        <span className="studio-recorder-generating-pill">Analyzing...</span>
      </div>
    );
  }

  const steps = getGenerationSteps(generation.type, generation.steps);
  return (
    <div className="studio-recorder-generation">
      <div className="studio-recorder-generation-steps">
        {steps.map((step) => (
          <div
            className={`studio-recorder-generation-step studio-recorder-generation-step-${step.state}`}
            key={step.title}
          >
            <span className="studio-recorder-generation-step-marker">
              {step.state === 'success' ? <CheckIcon /> : null}
            </span>
            <div>
              <div className="studio-recorder-generation-step-title">
                {step.title}
              </div>
              <div className="studio-recorder-generation-step-description">
                {step.description}
              </div>
              {step.details ? (
                <div className="studio-recorder-generation-step-details">
                  {step.details}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RecorderDetailView({
  activeCode,
  activeCodeType,
  activeTab,
  codeLabel,
  detailSession,
  fallback,
  generation,
  isGenerating,
  isKnowledgeGenerating,
  knowledgeGeneration,
  knowledgeMarkdown,
  onBackToList,
  onCodeTabClick,
  onCodeTypeChange,
  onCopyCode,
  onExportCode,
  onExportKnowledge,
  onGenerateKnowledge,
  onKnowledgeTabClick,
  onLanguageChange,
  onCopyKnowledge,
  onRegenerateCode,
  onRegenerateKnowledge,
  onTabChange,
  selectedLanguage,
}: RecorderDetailViewProps) {
  if (!detailSession) {
    return fallback;
  }

  const canGenerateKnowledge =
    detailSession.status === 'completed' && detailSession.events.length > 0;
  const knowledgeError =
    knowledgeGeneration.sessionId === detailSession.id &&
    knowledgeGeneration.status === 'error'
      ? knowledgeGeneration.error
      : null;

  return (
    <section className="studio-recorder-detail">
      <div className="studio-recorder-detail-nav">
        <button
          className="studio-recorder-inline-icon-button"
          onClick={onBackToList}
          title="Back to recordings"
          type="button"
        >
          <BackIcon />
        </button>
        <div className="studio-recorder-session-heading">
          <div className="studio-recorder-session-title">
            {detailSession.name}
          </div>
          <div className="studio-recorder-session-meta">
            {platformLabel(detailSession.target.platformId)} /{' '}
            {detailSession.target.label} / {detailSession.events.length} events
          </div>
        </div>
      </div>

      <div className="studio-recorder-tabs">
        <button
          className={
            activeTab === 'timeline'
              ? 'studio-recorder-tab studio-recorder-tab-active'
              : 'studio-recorder-tab'
          }
          onClick={() => onTabChange('timeline')}
          type="button"
        >
          <TimelineIcon />
          <span>Timeline</span>
        </button>
        <span className="studio-recorder-tab-arrow">
          <ArrowIcon />
        </span>
        <button
          className={
            activeTab === 'knowledge'
              ? 'studio-recorder-tab studio-recorder-tab-active'
              : 'studio-recorder-tab'
          }
          disabled={!canGenerateKnowledge}
          onClick={onKnowledgeTabClick}
          title={
            canGenerateKnowledge
              ? undefined
              : 'Finish recording before generating knowledge'
          }
          type="button"
        >
          <RecorderOutputIcon />
          <span>Knowledge</span>
        </button>
        <span className="studio-recorder-tab-arrow">
          <ArrowIcon />
        </span>
        <button
          className={
            activeTab === 'code'
              ? 'studio-recorder-tab studio-recorder-tab-active'
              : 'studio-recorder-tab'
          }
          disabled={detailSession.events.length === 0}
          onClick={onCodeTabClick}
          title={
            detailSession.events.length === 0
              ? 'Record events before generating code'
              : undefined
          }
          type="button"
        >
          <CodeIcon />
          <span>Code</span>
        </button>
      </div>

      {activeTab === 'timeline' ? (
        detailSession.events.length > 0 ? (
          <div className="studio-recorder-timeline">
            <RecordTimeline events={detailSession.events} />
          </div>
        ) : (
          <div className="studio-recorder-empty">
            Operate the connected device while recording to capture events.
          </div>
        )
      ) : activeTab === 'knowledge' ? (
        <div className="studio-recorder-code-pane">
          <div className="studio-recorder-code-toolbar">
            <div className="studio-recorder-knowledge-file-label">
              <RecorderOutputIcon />
              <span>KNOWLEDGE.md</span>
            </div>
            <div className="studio-recorder-code-spacer" />
            <button
              disabled={!knowledgeMarkdown || isKnowledgeGenerating}
              onClick={onCopyKnowledge}
              title="Copy knowledge base"
              type="button"
            >
              <CopyIcon />
            </button>
            <button
              disabled={!canGenerateKnowledge || isKnowledgeGenerating}
              onClick={onRegenerateKnowledge}
              title="Regenerate knowledge base"
              type="button"
            >
              <ReloadIcon />
            </button>
            <button
              className="studio-recorder-knowledge-download"
              disabled={!knowledgeMarkdown || isKnowledgeGenerating}
              onClick={() => onExportKnowledge('markdown')}
              title="Download Markdown"
              type="button"
            >
              <span className="studio-recorder-knowledge-format">MD</span>
            </button>
            <button
              className="studio-recorder-knowledge-download studio-recorder-knowledge-download-json"
              disabled={!knowledgeMarkdown || isKnowledgeGenerating}
              onClick={() => onExportKnowledge('json')}
              title="Download JSON"
              type="button"
            >
              <span className="studio-recorder-knowledge-format">JSON</span>
            </button>
          </div>

          {knowledgeError ? (
            <div className="studio-recorder-notice">{knowledgeError}</div>
          ) : null}

          {isKnowledgeGenerating ? (
            <div className="studio-recorder-generating-card">
              <span>Generating knowledge base...</span>
              <span className="studio-recorder-generating-pill">
                Analyzing...
              </span>
            </div>
          ) : knowledgeMarkdown ? (
            <pre className="studio-recorder-code-block studio-recorder-knowledge-block">
              {knowledgeMarkdown}
            </pre>
          ) : (
            <div className="studio-recorder-knowledge-empty">
              <div>
                <strong>Generate UI knowledge from this recording</strong>
                <span>
                  Recorded actions and screenshots will be analyzed by the
                  configured model.
                </span>
              </div>
              <button
                className="studio-recorder-knowledge-generate"
                disabled={!canGenerateKnowledge}
                onClick={onGenerateKnowledge}
                type="button"
              >
                {knowledgeError
                  ? 'Retry generation'
                  : 'Generate knowledge base'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="studio-recorder-code-pane">
          <div className="studio-recorder-code-toolbar">
            <label className="studio-recorder-select-shell studio-recorder-code-type-select">
              <CodeIcon />
              <select
                disabled={isGenerating}
                onChange={(event) => {
                  onCodeTypeChange(
                    event.target.value as StudioRecorderCodeType,
                  );
                }}
                value={activeCodeType}
              >
                <option value="markdown">Markdown</option>
                <option value="yaml">YAML</option>
                <option
                  disabled={!isPlaywrightAvailable(detailSession)}
                  value="playwright"
                >
                  Playwright
                </option>
              </select>
            </label>

            {activeCodeType !== 'playwright' ? (
              <label className="studio-recorder-select-shell studio-recorder-language-select">
                <select
                  disabled={isGenerating}
                  onChange={(event) => {
                    onLanguageChange(event.target.value);
                  }}
                  value={selectedLanguage}
                >
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <div className="studio-recorder-code-spacer" />
            <button
              disabled={!activeCode || isGenerating}
              onClick={onCopyCode}
              title={`Copy ${codeLabel}`}
              type="button"
            >
              <CopyIcon />
            </button>
            <button
              disabled={isGenerating || detailSession.events.length === 0}
              onClick={onRegenerateCode}
              title={`Regenerate ${codeLabel}`}
              type="button"
            >
              <ReloadIcon />
            </button>
            <button
              disabled={!activeCode || isGenerating}
              onClick={onExportCode}
              title={`Download ${codeLabel}`}
              type="button"
            >
              <DownloadIcon />
            </button>
          </div>

          <RecorderGenerationStatus
            detailSession={detailSession}
            generation={generation}
          />

          {detailSession.events.length === 0 ? (
            <div className="studio-recorder-empty">
              Record events before generating code.
            </div>
          ) : generation.status === 'error' &&
            generation.sessionId === detailSession.id &&
            generation.type === activeCodeType ? (
            <div className="studio-recorder-notice">
              {generation.error || `Failed to generate ${codeLabel}.`}
            </div>
          ) : isGenerating ? null : activeCode ? (
            <pre className="studio-recorder-code-block">{activeCode}</pre>
          ) : (
            <div className="studio-recorder-empty">
              Generated code will appear here.
            </div>
          )}
        </div>
      )}
    </section>
  );
}

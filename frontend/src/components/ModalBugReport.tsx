import { useState } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  AppButton,
  AppFormModal,
  AppInput,
  AppSelect,
  AppTextarea,
  uiCx,
  uiLayout,
  uiSpacing,
} from '@/components/ui';

interface ModalBugReportProps {
  onClose: () => void;
  onSuccess: () => void;
}

const severityOptions = [
  { value: 'Low', label: "Low — Minor issue, doesn't affect core functionality" },
  { value: 'Medium', label: 'Medium — Affects functionality but has workaround' },
  { value: 'High', label: 'High — Critical issue, blocks core functionality' },
];

export default function ModalBugReport({ onClose, onSuccess }: ModalBugReportProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }

    if (!description.trim()) {
      toast.error('Description is required');
      return;
    }

    setSubmitting(true);

    try {
      const pageUrl = window.location.href;
      const userAgent = navigator.userAgent;
      const screen = {
        width: window.screen.width,
        height: window.screen.height,
      };

      await api('POST', '/bug-report', {
        title: title.trim(),
        description: description.trim(),
        severity,
        page_url: pageUrl,
        user_agent: userAgent,
        screen,
      });

      toast.success('Bug report submitted successfully!');
      setTitle('');
      setDescription('');
      setSeverity('Medium');
      onSuccess();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to submit bug report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppFormModal
      open
      onClose={onClose}
      title="Report a Bug"
      description="Tell us what went wrong so we can fix it"
      quickInfo={
        <>
          <p>Include steps to reproduce and what you expected to happen.</p>
          <p className="font-medium text-gray-700">Captured automatically:</p>
          <ul className="list-inside list-disc space-y-0.5">
            <li>Current page URL</li>
            <li>Browser and device information</li>
            <li>Screen resolution</li>
            <li>Your user account</li>
          </ul>
        </>
      }
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton variant="secondary" size="sm" type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </AppButton>
          <AppButton
            size="sm"
            type="submit"
            form="bug-report-form"
            disabled={submitting}
            loading={submitting}
          >
            {submitting ? 'Submitting…' : 'Submit Report'}
          </AppButton>
        </div>
      }
    >
      <form id="bug-report-form" onSubmit={handleSubmit} className={uiCx('space-y-4', uiSpacing.sectionStack)}>
        <AppInput
          label="Title *"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Brief description of the issue"
          disabled={submitting}
          fieldHint="Title\n\nA short summary of the problem."
        />

        <AppTextarea
          label="Description *"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          placeholder="Please provide detailed information about the bug, including steps to reproduce if possible…"
          disabled={submitting}
          fieldHint="Description\n\nSteps to reproduce, expected vs actual behavior, and any error messages."
        />

        <AppSelect
          label="Severity *"
          value={severity}
          onChange={(e) => setSeverity(e.target.value as 'Low' | 'Medium' | 'High')}
          options={severityOptions}
          disabled={submitting}
          fieldHint="Severity\n\nHow much this issue affects your work."
        />
      </form>
    </AppFormModal>
  );
}

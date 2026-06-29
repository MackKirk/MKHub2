import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCodeLib from 'qrcode';
import { withFileAccessToken } from '@/lib/api';
import type { TrainingCertificate } from '@/hooks/useMyTrainingData';
import {
  AppBadge,
  AppCard,
  AppEmptyState,
  AppSectionHeader,
  appSectionPresetProps,
  uiCx,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

function CertificateQr({ data }: { data: string }) {
  const [src, setSrc] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    QRCodeLib.toDataURL(data, { width: 64, margin: 1 })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc('');
      });
    return () => {
      cancelled = true;
    };
  }, [data]);

  if (!src) {
    return <div className="h-16 w-16 rounded bg-gray-100" aria-hidden />;
  }
  return <img src={src} alt="Certificate QR code" className="h-16 w-16 rounded" />;
}

type Props = {
  certificates?: TrainingCertificate[];
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string | null;
  embedded?: boolean;
};

function CertificateCard({ cert, expired }: { cert: TrainingCertificate; expired?: boolean }) {
  return (
    <AppCard className={expired ? 'opacity-90' : undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold text-gray-900">{cert.course_title}</h3>
          <p className={uiTypography.helper}>Issued: {new Date(cert.issued_at).toLocaleDateString()}</p>
          {cert.expires_at ? (
            <p className={uiCx(uiTypography.helper, expired && 'font-semibold text-orange-600')}>
              {expired ? 'Expired' : 'Expires'}: {new Date(cert.expires_at).toLocaleDateString()}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-gray-500">Certificate #: {cert.certificate_number}</p>
          {expired ? <AppBadge variant="warning" className="mt-2">Expired</AppBadge> : null}
        </div>
        {cert.qr_code_data ? <CertificateQr data={cert.qr_code_data} /> : null}
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {cert.certificate_file_id ? (
          <a
            href={withFileAccessToken(`/files/${cert.certificate_file_id}`)}
            download
            className="inline-flex h-9 w-full items-center justify-center rounded-md border border-brand-red bg-gradient-to-r from-brand-red to-[#ee2b2b] px-4 text-xs font-medium text-white hover:from-brand-red hover:to-brand-red sm:flex-1"
          >
            Download PDF
          </a>
        ) : null}
        {expired ? (
          <Link
            to={`/training/${cert.course_id}`}
            className="inline-flex h-9 w-full items-center justify-center rounded-md border border-gray-300 bg-white px-4 text-xs font-medium text-gray-700 hover:bg-gray-50 sm:flex-1"
          >
            Renew training
          </Link>
        ) : null}
      </div>
    </AppCard>
  );
}

export default function TrainingCertificates({
  certificates = [],
  isLoading,
  isError,
  errorMessage,
  embedded,
}: Props) {
  const validCertificates = useMemo(() => certificates.filter((c) => !c.is_expired), [certificates]);
  const expiredCertificates = useMemo(() => certificates.filter((c) => c.is_expired), [certificates]);

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-48 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <AppEmptyState
        title="Could not load certificates"
        description={errorMessage || 'Please try again later.'}
      />
    );
  }

  return (
    <div className={uiSpacing.sectionStack}>
      {!embedded ? (
        <AppSectionHeader
          title="My certificates"
          description="LMS certificates earned from completed internal courses."
          {...appSectionPresetProps('education')}
        />
      ) : null}

      {validCertificates.length > 0 ? (
        <div className={uiSpacing.sectionStack}>
          <h2 className={uiTypography.sectionTitle}>Valid certificates</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {validCertificates.map((cert) => (
              <CertificateCard key={cert.id} cert={cert} />
            ))}
          </div>
        </div>
      ) : null}

      {expiredCertificates.length > 0 ? (
        <div className={uiSpacing.sectionStack}>
          <h2 className={uiCx(uiTypography.sectionTitle, 'text-orange-700')}>Expired certificates</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {expiredCertificates.map((cert) => (
              <CertificateCard key={cert.id} cert={cert} expired />
            ))}
          </div>
        </div>
      ) : null}

      {certificates.length === 0 ? (
        <AppEmptyState
          title="No certificates yet"
          description="Complete internal training courses to earn certificates."
          action={
            <Link
              to="/training?tab=courses"
              className="inline-flex h-9 items-center justify-center rounded-md border border-brand-red bg-gradient-to-r from-brand-red to-[#ee2b2b] px-4 text-xs font-medium text-white hover:from-brand-red hover:to-brand-red"
            >
              Browse courses
            </Link>
          }
        />
      ) : null}
    </div>
  );
}

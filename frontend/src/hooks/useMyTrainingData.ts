import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  buildCalendarEventsFromRecords,
  buildExpiringAlerts,
  type HrTrainingRecord,
  upcomingScheduledRecords,
} from '@/lib/trainingPersonalUtils';

export type TrainingCourse = {
  id: string;
  title: string;
  description?: string;
  category_label?: string;
  thumbnail_file_id?: string;
  estimated_duration_minutes?: number;
  tags?: string[];
  progress_percent: number;
  completed_at?: string;
  certificate_id?: string;
  certificate_expires_at?: string;
};

export type TrainingData = {
  completed: TrainingCourse[];
  in_progress: TrainingCourse[];
  required: TrainingCourse[];
  expired: TrainingCourse[];
  available?: TrainingCourse[];
};

export type TrainingCertificate = {
  id: string;
  course_id: string;
  course_title?: string;
  issued_at: string;
  expires_at?: string;
  certificate_number: string;
  qr_code_data?: string;
  certificate_file_id?: string;
  is_expired: boolean;
};

export type MatrixSnapshotItem = {
  id: string;
  label: string;
  cell_kind?: string;
  display: string;
  record: HrTrainingRecord | null;
};

export function useMyTrainingData() {
  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ id: string }>('GET', '/auth/me'),
  });
  const userId = me?.id ? String(me.id) : '';

  const trainingQuery = useQuery<TrainingData>({
    queryKey: ['training'],
    queryFn: () => api<TrainingData>('GET', '/training'),
    enabled: !!userId,
  });

  const certificatesQuery = useQuery<TrainingCertificate[]>({
    queryKey: ['training-certificates'],
    queryFn: () => api<TrainingCertificate[]>('GET', '/training/certificates'),
    enabled: !!userId,
  });

  const recordsQuery = useQuery<HrTrainingRecord[]>({
    queryKey: ['employee-training-records', 'user', userId],
    queryFn: () => api<HrTrainingRecord[]>('GET', `/auth/users/${encodeURIComponent(userId)}/training-records`),
    enabled: !!userId,
  });

  const matrixQuery = useQuery<{ items: MatrixSnapshotItem[] }>({
    queryKey: ['user-training-matrix', 'user', userId],
    queryFn: () =>
      api<{ items: MatrixSnapshotItem[] }>(
        'GET',
        `/auth/users/${encodeURIComponent(userId)}/training-matrix`,
      ),
    enabled: !!userId,
  });

  const training = trainingQuery.data;
  const certificates = certificatesQuery.data ?? [];
  const records = recordsQuery.data ?? [];
  const matrixItems = matrixQuery.data?.items ?? [];

  const summaryCounts = useMemo(
    () => ({
      required: training?.required?.length ?? 0,
      inProgress: training?.in_progress?.length ?? 0,
      completed: training?.completed?.length ?? 0,
      expired: training?.expired?.length ?? 0,
      available: training?.available?.length ?? 0,
      certificates: certificates.length,
      validCertificates: certificates.filter((c) => !c.is_expired).length,
      hrRecords: records.length,
      upcoming: upcomingScheduledRecords(records, 100).length,
      matrixSlots: matrixItems.length,
      matrixCovered: matrixItems.filter((i) => i.record).length,
    }),
    [training, certificates, records, matrixItems],
  );

  const calendarEvents = useMemo(() => buildCalendarEventsFromRecords(records), [records]);
  const expiringAlerts = useMemo(
    () => buildExpiringAlerts(certificates, records),
    [certificates, records],
  );
  const upcomingRecords = useMemo(() => upcomingScheduledRecords(records), [records]);

  const isLoading =
    meLoading ||
    trainingQuery.isLoading ||
    certificatesQuery.isLoading ||
    recordsQuery.isLoading ||
    matrixQuery.isLoading;

  const isError =
    trainingQuery.isError ||
    certificatesQuery.isError ||
    recordsQuery.isError ||
    matrixQuery.isError;

  const errorMessage = useMemo(() => {
    const errs = [
      trainingQuery.error,
      certificatesQuery.error,
      recordsQuery.error,
      matrixQuery.error,
    ].filter(Boolean);
    if (!errs.length) return null;
    return errs.map((e) => (e instanceof Error ? e.message : String(e))).join('; ');
  }, [trainingQuery.error, certificatesQuery.error, recordsQuery.error, matrixQuery.error]);

  return {
    userId,
    training,
    certificates,
    records,
    matrixItems,
    summaryCounts,
    calendarEvents,
    expiringAlerts,
    upcomingRecords,
    isLoading,
    isError,
    errorMessage,
    trainingQuery,
    certificatesQuery,
    recordsQuery,
    matrixQuery,
  };
}

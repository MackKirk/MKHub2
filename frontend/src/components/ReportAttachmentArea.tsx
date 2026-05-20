import { AppFileUpload } from '@/components/ui';

/** @deprecated Use AppFileUpload mode="single" from @/components/ui */
export function ReportAttachmentAreaSingle({
  file,
  setFile,
  accept,
  label,
}: {
  file: File | null;
  setFile: (f: File | null) => void;
  accept?: string;
  label?: string;
}) {
  return (
    <AppFileUpload
      mode="single"
      value={file}
      onChange={setFile}
      accept={accept}
      label={label}
    />
  );
}

/** @deprecated Use AppFileUpload mode="multiple" from @/components/ui */
export function ReportAttachmentAreaMultiple({
  files,
  setFiles,
  accept,
  label,
}: {
  files: File[];
  setFiles: (f: File[] | ((prev: File[]) => File[])) => void;
  accept?: string;
  label?: string;
}) {
  return (
    <AppFileUpload
      mode="multiple"
      value={files}
      onChange={(next) => setFiles(next)}
      accept={accept}
      label={label}
    />
  );
}

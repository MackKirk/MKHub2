import { api } from "./api";

const SAFETY_FORM_CATEGORY = "safety-form";

export async function uploadSafetyFormFile(args: {
  projectId: string;
  inspectionId?: string;
  file: { uri: string; name: string; type: string };
}): Promise<string> {
  const form = new FormData();
  form.append("file", {
    uri: args.file.uri,
    name: args.file.name,
    type: args.file.type
  } as unknown as Blob);
  form.append("original_name", args.file.name);
  form.append("content_type", args.file.type);
  form.append("project_id", args.projectId);
  form.append("client_id", "");
  form.append("employee_id", "");
  form.append("category_id", SAFETY_FORM_CATEGORY);
  if (args.inspectionId?.trim()) {
    form.append("pending_safety_sign_inspection_id", args.inspectionId.trim());
  }

  const response = await api.post<{ id: string }>("/files/upload-proxy", form, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return response.data.id;
}

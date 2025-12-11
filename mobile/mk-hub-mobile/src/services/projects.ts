import { api } from "./api";
import type { ProjectListItem } from "../types/projects";

// Projects and file upload integration:
// - GET /projects?q=...
// - POST /files/upload-proxy (multipart/form-data)
// - POST /projects/{project_id}/files (attach uploaded FileObject to project)

export const searchProjects = async (
  query: string
): Promise<ProjectListItem[]> => {
  const response = await api.get<ProjectListItem[]>("/projects", {
    params: query ? { q: query } : undefined
  });
  return response.data;
};

export interface UploadProjectFileArgs {
  projectId: string;
  category: string;
  description: string;
  file: {
    uri: string;
    name: string;
    type: string;
  };
}

export const uploadProjectFile = async (
  args: UploadProjectFileArgs
): Promise<void> => {
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
  form.append("category_id", args.category);

  const uploadResp = await api.post<{ id: string; key: string }>(
    "/files/upload-proxy",
    form,
    {
      headers: {
        "Content-Type": "multipart/form-data"
      }
    }
  );

  const fileObjectId = uploadResp.data.id;

  await api.post(`/projects/${args.projectId}/files`, null, {
    params: {
      file_object_id: fileObjectId,
      category: args.category,
      original_name: args.file.name
    }
  });
};



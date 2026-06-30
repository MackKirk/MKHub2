import { api } from "./api";
import type {
  ProjectDetail,
  ProjectFileCategory,
  ProjectFileItem,
  ProjectListItem,
  ProjectListKind,
  ProjectListResponse
} from "../types/projects";
import {
  BUSINESS_LINE_CONSTRUCTION,
  BUSINESS_LINE_REPAIRS
} from "../lib/permissions";

export interface BusinessProjectsQuery {
  listKind: ProjectListKind;
  businessLine?: string;
  q?: string;
  page?: number;
  limit?: number;
  relatedToMe?: boolean;
  status?: string;
  statusNot?: string;
  divisionId?: string;
  clientId?: string;
  estimatorId?: string;
}

function listEndpoint(listKind: ProjectListKind): string {
  switch (listKind) {
    case "opportunities":
      return "/projects/business/opportunities";
    case "leak_investigations":
      return "/projects/business/leak-investigations";
    default:
      return "/projects/business/projects";
  }
}

export const fetchBusinessProjects = async (
  query: BusinessProjectsQuery
): Promise<ProjectListResponse> => {
  const businessLine =
    query.businessLine ??
    (query.listKind === "leak_investigations"
      ? BUSINESS_LINE_REPAIRS
      : BUSINESS_LINE_CONSTRUCTION);

  const response = await api.get<ProjectListResponse | ProjectListItem[]>(
    listEndpoint(query.listKind),
    {
      params: {
        business_line: businessLine,
        q: query.q || undefined,
        page: query.page ?? 1,
        limit: query.limit ?? 25,
        related_to_me: query.relatedToMe ? true : undefined,
        status: query.status || undefined,
        status_not: query.statusNot || undefined,
        division_id: query.divisionId || undefined,
        client_id: query.clientId || undefined,
        estimator_id: query.estimatorId || undefined
      }
    }
  );

  if (Array.isArray(response.data)) {
    return {
      items: response.data,
      total: response.data.length,
      page: 1,
      limit: response.data.length
    };
  }
  return response.data;
};

/** Legacy search — kept for upload/clock flows that pick any project. */
export const searchProjects = async (
  query: string
): Promise<ProjectListItem[]> => {
  const response = await api.get<ProjectListItem[]>("/projects", {
    params: query ? { q: query } : undefined
  });
  return response.data;
};

export const getProjectDetail = async (
  projectId: string
): Promise<ProjectDetail> => {
  const response = await api.get<ProjectDetail>(`/projects/${projectId}`);
  return response.data;
};

export const getProjectFiles = async (
  projectId: string
): Promise<ProjectFileItem[]> => {
  const response = await api.get<ProjectFileItem[]>(
    `/projects/${projectId}/files`
  );
  return response.data;
};

export const getProjectFileCategories = async (): Promise<
  ProjectFileCategory[]
> => {
  const response = await api.get<ProjectFileCategory[]>(
    "/clients/file-categories"
  );
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

/* eslint-disable @typescript-eslint/no-explicit-any -- GitHub REST payloads are schemaless at this adapter boundary. */
import { getConfig } from "./config";
import { FALLBACK_STATUSES } from "./constants";
import { HttpError } from "./http";
import type {
  Board,
  BoardIssue,
  Connection,
  IssueComment,
  Project,
  Repository,
  StatusOption,
} from "./types";

type Fetcher = typeof fetch;

type GithubErrorBody = { message?: string; documentation_url?: string };

const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  "status: backlog": "Backlog",
  todo: "Todo",
  "to do": "Todo",
  "status: todo": "Todo",
  "in progress": "In progress",
  "status: in progress": "In progress",
  "in-progress": "In progress",
  review: "Review",
  "in review": "Review",
  "status: review": "Review",
  done: "Done",
  "status: done": "Done",
};

function repositoryParts(fullName: string) {
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) throw new HttpError(400, "Repository must use owner/name format");
  return { owner, repo };
}

function mapRepository(repo: Record<string, any>): Repository {
  return {
    id: repo.id,
    nodeId: repo.node_id,
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner.login,
    private: repo.private,
    archived: repo.archived,
    defaultBranch: repo.default_branch,
    url: repo.html_url,
    permissions: repo.permissions,
  };
}

function inferStatus(labels: Array<{ name: string }>, state: string) {
  for (const label of labels) {
    const status = STATUS_LABELS[label.name.toLowerCase()];
    if (status) return status;
  }
  if (state === "closed") return "Done";
  return "Todo";
}

function mapRestIssue(issue: Record<string, any>, repository: string): BoardIssue {
  const labels = (issue.labels || []).map((label: string | Record<string, any>) =>
    typeof label === "string" ? { name: label, color: "8b949e" } : { name: label.name, color: label.color },
  );
  return {
    id: String(issue.id),
    nodeId: issue.node_id,
    number: issue.number,
    title: issue.title,
    body: issue.body || "",
    state: issue.state,
    status: inferStatus(labels, issue.state),
    url: issue.html_url,
    repository,
    labels,
    author: issue.user ? { login: issue.user.login, avatarUrl: issue.user.avatar_url } : undefined,
    assignees: (issue.assignees || []).map((user: Record<string, any>) => ({
      login: user.login,
      avatarUrl: user.avatar_url,
    })),
    commentCount: issue.comments || 0,
    updatedAt: issue.updated_at,
  };
}

function mapRestComment(comment: Record<string, any>): IssueComment {
  return {
    id: comment.id,
    body: comment.body || "",
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
    url: comment.html_url,
    author: { login: comment.user.login, avatarUrl: comment.user.avatar_url },
  };
}

export class GitHubClient {
  constructor(
    private token: string,
    private fetcher: Fetcher = fetch,
    private apiUrl = getConfig().githubApiUrl,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${this.apiUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "git-master-open-source",
        ...init.headers,
      },
    });
    const body = response.status === 204 ? undefined : await response.json().catch(() => undefined);
    if (!response.ok) {
      const error = body as GithubErrorBody | undefined;
      throw new HttpError(response.status, error?.message || `GitHub request failed (${response.status})`, error);
    }
    return body as T;
  }

  private async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const body = await this.request<{ data?: T; errors?: Array<{ message: string }> }>("/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (body.errors?.length) throw new HttpError(422, body.errors.map((error) => error.message).join("; "));
    if (!body.data) throw new HttpError(502, "GitHub returned an empty GraphQL response");
    return body.data;
  }

  getViewer() {
    return this.request<{ login: string; avatar_url: string; name: string | null }>("/user");
  }

  async verifyScope(scopeType: Connection["scopeType"], owner?: string, repository?: string) {
    if (scopeType === "organization") {
      if (!owner) throw new HttpError(400, "Organization login is required");
      await this.request(`/orgs/${encodeURIComponent(owner)}`);
    }
    if (scopeType === "repository") {
      if (!owner || !repository) throw new HttpError(400, "Repository owner and name are required");
      await this.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`);
    }
  }

  async listRepositories(connection: Connection): Promise<Repository[]> {
    if (connection.scopeType === "repository") {
      const repo = await this.request<Record<string, any>>(
        `/repos/${encodeURIComponent(connection.owner!)}/${encodeURIComponent(connection.repository!)}`,
      );
      return [mapRepository(repo)];
    }
    const path = connection.scopeType === "organization"
      ? `/orgs/${encodeURIComponent(connection.owner!)}/repos?per_page=100&sort=updated`
      : "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member";
    const repositories = await this.request<Array<Record<string, any>>>(path);
    return repositories.filter((repo) => !repo.disabled).map(mapRepository);
  }

  async listProjects(connection: Connection, repository?: string): Promise<Project[]> {
    let query: string;
    let variables: Record<string, string>;
    if (repository) {
      const { owner, repo } = repositoryParts(repository);
      query = `query($owner:String!,$repo:String!){repository(owner:$owner,name:$repo){projectsV2(first:50,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{id number title url closed}}}}`;
      variables = { owner, repo };
      const data = await this.graphql<{ repository: { projectsV2: { nodes: Project[] } } | null }>(query, variables);
      return data.repository?.projectsV2.nodes || [];
    }
    const owner = connection.owner || connection.login;
    const ownerType = connection.scopeType === "organization" ? "organization" : "user";
    query = `query($login:String!){${ownerType}(login:$login){projectsV2(first:50,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{id number title url closed}}}}`;
    variables = { login: owner };
    const data = await this.graphql<Record<string, { projectsV2: { nodes: Project[] } } | null>>(query, variables);
    return data[ownerType]?.projectsV2.nodes || [];
  }

  async getRepositoryBoard(repository: string): Promise<Board> {
    const { owner, repo } = repositoryParts(repository);
    const issues = await this.request<Array<Record<string, any>>>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?state=all&per_page=100&sort=updated`,
    );
    return {
      source: "repository",
      statuses: FALLBACK_STATUSES,
      issues: issues.filter((issue) => !issue.pull_request).map((issue) => mapRestIssue(issue, repository)),
    };
  }

  async getProjectBoard(projectId: string, repository?: string): Promise<Board> {
    const query = `query($id:ID!){node(id:$id){... on ProjectV2{
      id fields(first:50){nodes{... on ProjectV2SingleSelectField{id name options{id name color}}}}
      items(first:100){nodes{id fieldValues(first:30){nodes{... on ProjectV2ItemFieldSingleSelectValue{name optionId field{... on ProjectV2SingleSelectField{id name}}}}} content{
        ... on Issue{id number title body state url updatedAt repository{nameWithOwner} author{login avatarUrl} labels(first:20){nodes{name color}} assignees(first:10){nodes{login avatarUrl}} comments{totalCount}}
      }}}
    }}}`;
    type ProjectIssue = {
      id: string; number: number; title: string; body: string | null; state: "OPEN" | "CLOSED"; url: string;
      updatedAt: string; repository: { nameWithOwner: string }; author?: { login: string; avatarUrl: string };
      labels: { nodes: Array<{ name: string; color: string }> };
      assignees: { nodes: Array<{ login: string; avatarUrl: string }> }; comments: { totalCount: number };
    };
    type ProjectData = { node: { id: string; fields: { nodes: Array<{ id: string; name: string; options: StatusOption[] }> }; items: { nodes: Array<{ id: string; fieldValues: { nodes: Array<{ name: string; optionId: string; field: { id: string; name: string } }> }; content: ProjectIssue | null }> } } | null };
    const data = await this.graphql<ProjectData>(query, { id: projectId });
    if (!data.node) throw new HttpError(404, "Project not found");
    // GraphQL inline fragments produce empty objects for Project fields of other
    // types (text, date, iteration, etc.). Only inspect populated select fields.
    const statusField = data.node.fields.nodes.find(
      (field) => typeof field?.name === "string" && field.name.toLowerCase() === "status",
    );
    const statuses = statusField?.options?.length ? statusField.options : FALLBACK_STATUSES;
    const issues = data.node.items.nodes.flatMap((item): BoardIssue[] => {
      const issue = item.content;
      // Draft issues, pull requests, and inaccessible content also arrive as
      // empty objects because this query intentionally selects Issue fields.
      if (
        !issue ||
        typeof issue.number !== "number" ||
        !issue.repository?.nameWithOwner ||
        (repository && issue.repository.nameWithOwner !== repository)
      ) return [];
      const statusValue = item.fieldValues.nodes.find((value) => value.field?.id === statusField?.id);
      const labels = issue.labels.nodes || [];
      return [{
        id: issue.id,
        nodeId: issue.id,
        itemId: item.id,
        number: issue.number,
        title: issue.title,
        body: issue.body || "",
        state: issue.state.toLowerCase() as "open" | "closed",
        status: statusValue?.name || inferStatus(labels, issue.state.toLowerCase()),
        statusOptionId: statusValue?.optionId,
        url: issue.url,
        repository: issue.repository.nameWithOwner,
        labels,
        author: issue.author,
        assignees: issue.assignees.nodes || [],
        commentCount: issue.comments.totalCount,
        updatedAt: issue.updatedAt,
      }];
    });
    return { source: "project", projectId, statusFieldId: statusField?.id, statuses, issues };
  }

  async createIssue(input: { repository: string; title: string; body: string; labels?: string[] }) {
    const { owner, repo } = repositoryParts(input.repository);
    return this.request<Record<string, any>>(`/repos/${owner}/${repo}/issues`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: input.title, body: input.body, labels: input.labels || [] }),
    });
  }

  async updateIssue(repository: string, number: number, input: { title?: string; body?: string; labels?: string[]; state?: "open" | "closed" }) {
    const { owner, repo } = repositoryParts(repository);
    return this.request<Record<string, any>>(`/repos/${owner}/${repo}/issues/${number}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  async deleteIssue(issueNodeId: string) {
    const mutation = `mutation($issue:ID!){deleteIssue(input:{issueId:$issue}){repository{id}}}`;
    await this.graphql(mutation, { issue: issueNodeId });
  }

  async getIssue(repository: string, number: number) {
    const { owner, repo } = repositoryParts(repository);
    const issue = await this.request<Record<string, any>>(`/repos/${owner}/${repo}/issues/${number}`);
    return mapRestIssue(issue, repository);
  }

  async addIssueToProject(projectId: string, issueNodeId: string) {
    const mutation = `mutation($project:ID!,$content:ID!){addProjectV2ItemById(input:{projectId:$project,contentId:$content}){item{id}}}`;
    const data = await this.graphql<{ addProjectV2ItemById: { item: { id: string } } }>(mutation, {
      project: projectId,
      content: issueNodeId,
    });
    return data.addProjectV2ItemById.item.id;
  }

  async updateProjectStatus(input: { projectId: string; itemId: string; fieldId: string; optionId: string }) {
    const mutation = `mutation($project:ID!,$item:ID!,$field:ID!,$option:String!){updateProjectV2ItemFieldValue(input:{projectId:$project,itemId:$item,fieldId:$field,value:{singleSelectOptionId:$option}}){projectV2Item{id}}}`;
    await this.graphql(mutation, {
      project: input.projectId,
      item: input.itemId,
      field: input.fieldId,
      option: input.optionId,
    });
  }

  async updateRepositoryStatus(repository: string, number: number, status: string, labels: string[], state: "open" | "closed") {
    const statusLabelNames = new Set(Object.keys(STATUS_LABELS));
    const nextLabels = labels.filter((label) => !statusLabelNames.has(label.toLowerCase()));
    const normalized = status.toLowerCase();
    if (normalized !== "todo" && normalized !== "done") nextLabels.push(`status: ${normalized}`);
    return this.updateIssue(repository, number, {
      labels: nextLabels,
      state: normalized === "done" ? "closed" : state === "closed" ? "open" : state,
    });
  }

  async listComments(repository: string, number: number): Promise<IssueComment[]> {
    const { owner, repo } = repositoryParts(repository);
    const comments = await this.request<Array<Record<string, any>>>(
      `/repos/${owner}/${repo}/issues/${number}/comments?per_page=100`,
    );
    return comments.map(mapRestComment);
  }

  async createComment(repository: string, number: number, body: string) {
    const { owner, repo } = repositoryParts(repository);
    return this.request(`/repos/${owner}/${repo}/issues/${number}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
  }

  async updateComment(repository: string, commentId: number, body: string) {
    const { owner, repo } = repositoryParts(repository);
    const comment = await this.request<Record<string, any>>(`/repos/${owner}/${repo}/issues/comments/${commentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    return mapRestComment(comment);
  }

  async uploadAttachment(input: { repository: string; issueNumber: number; filename: string; content: Buffer; contentType: string }) {
    const { owner, repo } = repositoryParts(input.repository);
    const safeName = input.filename.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "attachment";
    const path = `.git-master/uploads/issue-${input.issueNumber}/${Date.now()}-${safeName}`;
    const payload: Record<string, string> = {
      message: `docs: attach ${safeName} to issue #${input.issueNumber}`,
      content: input.content.toString("base64"),
    };
    if (getConfig().githubUploadBranch) payload.branch = getConfig().githubUploadBranch!;
    const result = await this.request<{ content: { html_url: string; download_url: string | null } }>(
      `/repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`,
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
    );
    const isImage = input.contentType.startsWith("image/");
    const url = isImage && result.content.download_url ? result.content.download_url : result.content.html_url;
    return { url, markdown: isImage ? `![${safeName}](${url})` : `[${safeName}](${url})`, path };
  }
}

export function githubClient(token: string) {
  return new GitHubClient(token);
}

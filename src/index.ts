import * as core from "@actions/core";
import * as github from "@actions/github";
import { minimatch } from "minimatch";
import { load } from "js-yaml";
import { readFileSync } from "fs";

type Reviewer = {
  name: string;
  paths?: string[];
  team?: boolean;
};

type Ignore = {
  authors?: string[];
  titles?: string[];
};

type Config = {
  reviewers: Reviewer[];
  ignore?: Ignore;
};

type Client = ReturnType<typeof github.getOctokit>;

async function run() {
  try {
    if (github.context.eventName !== "pull_request") {
      core.setFailed("This action only supports pull_request event");
      return;
    }

    const token = core.getInput("token", { required: true });
    const client = github.getOctokit(token);
    const dot = core.getBooleanInput("dot");

    const { data } = await client.rest.pulls.get({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      pull_number: github.context.issue.number,
    });
    if (data.state !== "open") {
      core.info("This pull request is not open");
      return;
    }

    const configFilePath = core.getInput("config-file-path");
    const config = load(readFileSync(configFilePath, "utf8")) as Config;
    core.debug(`Config: ${JSON.stringify(config)}`);
    if (config.ignore && !validateByIgnore(config.ignore, data.title)) {
      return;
    }

    const changedFiles = await getChangedFiles(client);
    if (changedFiles.length === 0) {
      core.info("No files changed");
      return;
    }
    const { users, teams } = getReviewers(changedFiles, config, dot);
    core.info(`User reviewers: ${users.join(",")}`);
    core.info(`Team reviewers: ${teams.join(",")}`);

    await client.rest.pulls.requestReviewers({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      pull_number: github.context.issue.number,
      reviewers: Array.from(users),
      team_reviewers: Array.from(teams),
    });
  } catch (error) {
    core.setFailed(
      error instanceof Error ? error.message : JSON.stringify(error),
    );
  }
}

async function getChangedFiles(client: Client): Promise<string[]> {
  const req = client.rest.pulls.listFiles.endpoint.merge({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    pull_number: github.context.issue.number,
  });
  const res = await client.paginate(req);
  const changedFiles = res.map((f: any) => f.filename as string); // eslint-disable-line @typescript-eslint/no-unsafe-member-access
  return changedFiles;
}

function validateByIgnore(ignore: Ignore, title: string): boolean {
  if (ignore.authors?.includes(github.context.actor)) {
    core.info(`Ignored author: ${github.context.actor}`);
    return false;
  }

  let isIgnoredByTitle = false;
  ignore.titles?.some((ignoreTitle) => {
    if (title.includes(ignoreTitle)) {
      core.info(`Ignored title: ${title}`);
      isIgnoredByTitle = true;
      return true;
    }
    return false;
  });
  return !isIgnoredByTitle;
}

function getReviewers(
  filenames: string[],
  config: Config,
  dot: boolean,
): { users: string[]; teams: string[] } {
  const users = new Set<string>();
  const teams = new Set<string>();
  config.reviewers
    .filter((reviewer) => reviewer.name !== github.context.actor)
    .forEach((reviewer) => {
      if (!reviewer.paths) {
        // if path is empty, always add reviewer
        if (reviewer.team) {
          teams.add(reviewer.name);
        } else {
          users.add(reviewer.name);
        }
        return;
      }
      reviewer.paths.some((path) => {
        const matchedFiles = filenames.filter(
          minimatch.filter(path, { matchBase: true, dot }),
        );
        core.debug(`Matched files: ${matchedFiles.join(",")}`);
        if (matchedFiles.length > 0) {
          if (reviewer.team) {
            teams.add(reviewer.name);
          } else {
            users.add(reviewer.name);
          }
          return true;
        }
        return false;
      });
    });
  return { users: Array.from(users), teams: Array.from(teams) };
}

run().then(
  () => {},
  () => {},
);

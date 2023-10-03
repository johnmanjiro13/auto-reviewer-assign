# auto-reviewer-assign

`auto-reviewer-assign` is a GitHub Action to assign reviewers to pull requests automatically.

## Usage

### Configuration

Create a `.github/auto-reviewer-assign.yml` file in your repository:

```yaml
reviewers:
  - name: always_user_name # Always assign this user
  - name: path_user_name # Assign this user if the path matches
    paths:
      - path/to/file
      - path/**
  - name: team_name # Assign this team
    team: true
ignore:
  authors: # Ignore PR if these authors contain PR's author
    - author_name
  titles: # Ignore PR if PR's title contains these words
    - wip
```

### Workflow

```yaml
name: Auto Reviewer Assign
on:
  pull_request:
    types: [opened, review_requested]

jobs:
  auto-reviewer-assign:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: johnmanjiro13/auto-reviewer-assign@v0.1.6
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
```

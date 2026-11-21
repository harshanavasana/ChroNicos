# Contributing

Thanks for helping improve ChroNicos. Bug reports, documentation fixes, and
focused code contributions are welcome.

## Before you start

- Search existing issues and pull requests so work is not duplicated.
- For a larger behavior or design change, open an issue first to discuss the
  approach.
- Never include API keys, resumes, recipient data, or other private information
  in issues, tests, screenshots, or commits.

## Local setup

1. Install Node.js 22.13+ or 24+.
2. Clone the repository and run `npm ci`.
3. Load the repository folder as an unpacked extension in Chrome.

## Before opening a pull request

Run the relevant checks:

```sh
npm run test:all
```

Include tests for behavior changes. Keep changes focused, preserve privacy and
explicit-consent boundaries, and describe user-visible changes and test results
in the pull request.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

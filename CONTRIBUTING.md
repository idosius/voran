# Contributing

Thanks for your interest in Voran. Issues and pull requests are welcome.

## Contributor license grant

Voran is published under the [PolyForm Noncommercial License 1.0.0](LICENSE.md). The author may also offer it under other terms, including commercial licenses. To keep that possible, every contribution needs the following grant.

By submitting a contribution (code, documentation, tests or any other material) to this project, you agree that:

1. You grant Ido Schacham (the "licensor") and anyone the licensor licenses the project to a perpetual, worldwide, non-exclusive, royalty-free, irrevocable license to use, copy, modify, distribute, sublicense and relicense your contribution under any terms, including commercial and proprietary ones.
2. You grant the licensor a perpetual, worldwide, non-exclusive, royalty-free, irrevocable patent license for your contribution, on the same terms as the patent license in the PolyForm Noncommercial License, but for any purpose.
3. The contribution is your original work, or you otherwise have the right to grant these licenses. If your employer has rights to your work, you have their permission.
4. You keep the copyright in your contribution. This grant does not transfer ownership.

Add this line to the description of your pull request to confirm:

> I agree to the contributor license grant in CONTRIBUTING.md.

## Before opening a pull request

- Run `npm run check` (typecheck, lint, format check and tests) and make sure it passes.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages, for example `fix(replace): keep undo stack in contenteditable`.
- Follow the conventions in [AGENTS.md](AGENTS.md), including the Testing Library rules for tests.

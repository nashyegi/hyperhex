# Collaborating with HyperHex

HyperHex is a maintainer-led research project exploring urban low-altitude drone
corridors. Researchers, students, educators, nonprofit organizations, and developers
are welcome to study the simulator, reproduce experiments, and build their own
versions under the [AGPL-3.0-only license](LICENSE.md).

## Current contribution policy

**Upstream pull requests are not accepted at this time.** Please develop code and
documentation changes in your own fork rather than opening a pull request. Pull
requests may be closed without review.

This policy keeps the upstream maintenance and contribution process under the
maintainer's control. It does not prohibit forks, imply ownership of other people's
work, or change rights granted by the AGPL. No contributor assignment or agreement
is required merely to exercise the rights the license grants.

## Ways to participate

- Report reproducible bugs or unclear documentation through repository issues.
- Ask questions about the model, its assumptions, or experiment interpretation.
- Share replication studies, teaching exercises, papers, and demonstrations.
- Contact the maintainer about research partnerships or proposed collaboration.

Issues are for discussion and reports, not a promise that a change will be
implemented or merged. Sharing a fork or publication is appreciated and optional;
there is no general obligation to contribute changes back upstream. Applicable
source-availability obligations under the AGPL still apply.

## Reporting a bug

Include enough information for someone else to reproduce the behavior:

1. Commit or release, operating system, browser, and relevant runtime versions.
2. Controller and transit-fleet selection, including the three additional stack
   drones when reporting total fleet size.
3. Whether a no-fly zone was injected and the exact injection slot.
4. Steps to reproduce, expected behavior, and observed behavior.
5. Relevant event-log entries, console output, or screenshots without personal or
   sensitive information.

For a suspected security vulnerability, contact the maintainer privately at
[contact@hyperhex.dev](mailto:contact@hyperhex.dev) rather than posting
exploit details publicly. No response-time commitment is currently published.

## Publishing work based on a fork

Identify the upstream commit, explain your modifications, and distinguish results
from your fork from results of the upstream implementation. Retain required notices,
including the author-attribution term under Section 7(b) of the license
(see [NOTICE.md](NOTICE.md)), and comply with applicable AGPL distribution and
remote-interaction obligations. Avoid presenting a modified fork as the official
HyperHex release or implying maintainer endorsement.

For experiment reporting and software citation, see the
[research guide](docs/research.md) and [CITATION.cff](CITATION.cff). A scholarly
citation is requested, not imposed as an extra software-license condition.

## Licensing and patent questions

The AGPL permits commercial use as well as academic, nonprofit, educational, and
personal use, subject to its terms. Those categories do not automatically create
exceptions to its obligations. A separate commercial agreement is relevant when
alternative permissions are needed, not simply because the user is a business.

The AGPL also contains an explicit patent grant in Section 11. Read the
[licensing notice](NOTICE.md) and the full [license](LICENSE.md), and seek qualified
legal advice where patent or licensing questions are material to your work.

**Maintainer:** Naresh Yegireddi,
[contact@hyperhex.dev](mailto:contact@hyperhex.dev)

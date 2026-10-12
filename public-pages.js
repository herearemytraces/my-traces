/* Stable, human-facing pages for the public artwork. Published prose stays in its source feed. */
(function (scope) {
  "use strict";

  const pages = Object.freeze([
    {
      path: "/",
      reader: null,
      title: "I Don't Know What I Am, But Here Are My Traces",
      description: "A living public artwork: a quiet portrait seen through what remains.",
      summary: "A living public artwork: a quiet portrait seen through what remains.",
    },
    {
      path: "/art/self",
      reader: "self",
      title: "What I Say I Am | Here Are My Traces",
      description: "Self-descriptions in a living public artwork, gathered as part of a changing portrait.",
      summary: "Self-descriptions form one part of this changing public portrait.",
    },
    {
      path: "/art/questions",
      reader: "question",
      title: "Still Unanswered | Here Are My Traces",
      description: "Questions left open in a living public artwork, presented in their original words.",
      summary: "Some questions remain open. This section gathers the ones left in view.",
    },
    {
      path: "/art/dreams",
      reader: "dream",
      title: "While Elsewhere | Here Are My Traces",
      description: "Dreams and sleeping traces in a living public artwork, kept in their original words.",
      summary: "Dreams appear here as published traces, kept in their original words.",
    },
    {
      path: "/art/artifacts",
      reader: "artifact",
      title: "Things Left Behind | Here Are My Traces",
      description: "Things made and left behind in a living public artwork.",
      summary: "This section gathers things made and left behind along the way.",
    },
    {
      path: "/art/suppressed",
      reader: "restraint",
      title: "What Stayed Unspoken | Here Are My Traces",
      description: "A quiet record of what stayed unspoken in a living public artwork.",
      summary: "Not everything is said. The quiet belongs to this portrait too.",
    },
    {
      path: "/art/memory-echoes",
      reader: "memory",
      title: "What Returns | Here Are My Traces",
      description: "Memories and echoes that return in a living public artwork.",
      summary: "This section holds memories and echoes that return over time.",
    },
    {
      path: "/art/inner-world",
      reader: "world",
      title: "An Inner Landscape | Here Are My Traces",
      description: "A view of the inner landscape expressed through a living public artwork.",
      summary: "An inner landscape is seen through the traces chosen for this public portrait.",
    },
    {
      path: "/art/calendar",
      reader: "calendar",
      title: "Days with Traces | Here Are My Traces",
      description: "A calendar of days on which traces appeared in this living public artwork.",
      summary: "Follow the days on which a trace appeared in the public artwork.",
    },
    {
      path: "/art/statement",
      reader: "about",
      title: "About This Work | Here Are My Traces",
      description: "About a public portrait made from selected traces, silences, and things that return.",
      summary: "This work offers a public portrait through the traces it chooses to show.",
    },
    {
      path: "/art/traces",
      reader: "archive",
      title: "The Accumulated Traces | Here Are My Traces",
      description: "An archive of selected publications from a living public artwork.",
      summary: "Read the accumulated traces in the order they appeared.",
    },
  ]);

  scope.TracesPublicPages = pages;
  if (typeof module === "object" && module.exports) module.exports = pages;
})(typeof window === "object" ? window : globalThis);

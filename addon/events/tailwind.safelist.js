const colorTemplate =
  "bg-{color}-{weight} hover:bg-{color}-{weight} text-{color}-{weight} border-{color}-{weight}";

const colors = [
  "blue",
  "brown",
  "desert",
  "gray",
  "green",
  "indigo",
  "orange",
  "pink",
  "purple",
  "red",
  "teal",
  "yellow",
];

const weights = [100, 200, 300, 400, 500, 600, 700, 800];

const colorClasses = colors.flatMap((color) =>
  weights
    .map((weight) => colorTemplate.replace(/{weight}/g, weight))
    .flatMap((template) => template.replace(/{color}/g, color).split(" "))
);

module.exports = Array.from(
  new Set([
    ...colorClasses
  ])
);

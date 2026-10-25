const ratio = (part, whole) => (whole ? part / whole : null);

const round = (value, digits = 3) => (value == null ? null : Number(value.toFixed(digits)));

// Per-label precision, recall and F1, plus macro F1 (unweighted mean over labels that occur).
export const classificationReport = (pairs, labels) => {
  const perLabel = labels.map((label) => {
    const truePositive = pairs.filter((pair) => pair.predicted === label && pair.expected === label).length;
    const predicted = pairs.filter((pair) => pair.predicted === label).length;
    const actual = pairs.filter((pair) => pair.expected === label).length;
    const precision = ratio(truePositive, predicted);
    const recall = ratio(truePositive, actual);
    const f1 = precision != null && recall != null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    return { label, support: actual, precision: round(precision), recall: round(recall), f1: round(f1) };
  });

  const scored = perLabel.filter((entry) => entry.support > 0);
  return {
    accuracy: round(ratio(pairs.filter((pair) => pair.predicted === pair.expected).length, pairs.length)),
    macroF1: round(scored.reduce((sum, entry) => sum + entry.f1, 0) / scored.length),
    perLabel,
  };
};

export const confusionMatrix = (pairs, labels) =>
  Object.fromEntries(
    labels.map((expected) => [
      expected,
      Object.fromEntries(labels.map((predicted) => [predicted, pairs.filter((pair) => pair.expected === expected && pair.predicted === predicted).length])),
    ]),
  );

// Priority agreement, plus the safety-relevant count: urgent tickets ranked below their label.
export const priorityReport = (pairs, levels) => {
  const rank = (level) => levels.indexOf(level);
  const distance = (pair) => Math.abs(rank(pair.predicted) - rank(pair.expected));
  const urgent = pairs.filter((pair) => rank(pair.expected) <= rank('High'));

  return {
    exactAgreement: round(ratio(pairs.filter((pair) => distance(pair) === 0).length, pairs.length)),
    withinOneLevel: round(ratio(pairs.filter((pair) => distance(pair) <= 1).length, pairs.length)),
    urgentUnderPrioritized: urgent.filter((pair) => rank(pair.predicted) > rank(pair.expected)).map((pair) => pair.id),
    overPrioritized: pairs.filter((pair) => rank(pair.predicted) < rank(pair.expected)).map((pair) => pair.id),
  };
};

export const percentile = (values, p) => {
  if (!values.length) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
};

// precision@k over queries that returned something, recall over labeled relevant chunks, hit@1, and
// how often off-topic queries correctly returned nothing.
export const retrievalReport = (results) => {
  const onTopic = results.filter((result) => result.relevant.length);
  const offTopic = results.filter((result) => !result.relevant.length);
  const answered = onTopic.filter((result) => result.retrieved.length);
  const hits = (result) => result.retrieved.filter((id) => result.relevant.includes(id)).length;
  const mean = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);

  return {
    precisionAtK: round(mean(answered.map((result) => hits(result) / result.retrieved.length))),
    recallAtK: round(mean(onTopic.map((result) => hits(result) / result.relevant.length))),
    hitAt1: round(ratio(onTopic.filter((result) => result.relevant.includes(result.retrieved[0])).length, onTopic.length)),
    onTopicWithNoResult: onTopic.filter((result) => !result.retrieved.length).map((result) => result.id),
    offTopicRejected: round(ratio(offTopic.filter((result) => !result.retrieved.length).length, offTopic.length)),
  };
};

export { ratio, round };

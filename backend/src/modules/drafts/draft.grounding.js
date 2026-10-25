const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

const numbersIn = (text) => new Set((text.match(NUMBER) ?? []).map((number) => number.replace(/,/g, '')));

/**
 * Cheap, deterministic checks that flag likely unsupported claims for the reviewer:
 * - citations of policies that were never retrieved (dropped from the stored citations), and
 * - figures (amounts, dates, durations, counts) that appear in none of the sources the model was given.
 * A flagged figure is not necessarily wrong, but the reviewer should confirm it before sending.
 */
export const checkGrounding = ({ reply, citedPolicyIds, policyIds, sourceText }) => {
  const known = new Set(policyIds);
  const unknownCitations = citedPolicyIds.filter((id) => !known.has(id));
  const sourceNumbers = numbersIn(sourceText);
  const unverifiedFigures = [...numbersIn(reply)].filter((number) => !sourceNumbers.has(number));

  return {
    citedPolicyIds: [...new Set(citedPolicyIds.filter((id) => known.has(id)))],
    warnings: [
      ...unknownCitations.map((id) => `Referred to a policy that was not provided: ${id}`),
      ...unverifiedFigures.map((figure) => `"${figure}" is not in the policies, account facts or conversation; verify before sending`),
    ],
    unsupportedClaimCount: unknownCitations.length + unverifiedFigures.length,
  };
};

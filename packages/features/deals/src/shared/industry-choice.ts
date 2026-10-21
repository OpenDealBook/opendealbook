type ListedIndustry = { id: string; name: string };

export function industryChoiceFor(
  industries: ListedIndustry[],
  extracted: string | null,
): { industry_id?: string; industry?: string } {
  if (extracted === null) {
    return {};
  }

  const listed = industries.find(
    (industry) =>
      industry.name.toLowerCase() === extracted.trim().toLowerCase(),
  );

  return listed ? { industry_id: listed.id } : { industry: extracted };
}

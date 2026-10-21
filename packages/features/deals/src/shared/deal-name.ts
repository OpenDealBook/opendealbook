export function dealDisplayName(deal: { firm: { name: string } }): string {
  return deal.firm.name;
}

type OutsideNameSource = {
  code_name: string | null;
  firm: { name: string };
};

export function outsideDealName(deal: OutsideNameSource): string {
  return deal.code_name ?? deal.firm.name;
}

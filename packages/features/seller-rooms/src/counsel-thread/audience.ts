interface SellerSidePerson {
  userId: string;
  name: string;
}

export interface SellerSide {
  sellers: SellerSidePerson[];
  counsel: SellerSidePerson[];
  buyerTeam: string;
}

function listed(names: string[]): string {
  return names.length > 1
    ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
    : names[0]!;
}

export function audienceNote(viewerUserId: string, side: SellerSide): string {
  const viewerIsSeller = side.sellers.some(
    (seller) => seller.userId === viewerUserId,
  );
  const [own, other] = viewerIsSeller
    ? [side.sellers, side.counsel]
    : [side.counsel, side.sellers];
  const withYou = [...own, ...other]
    .filter((person) => person.userId !== viewerUserId)
    .map((person) => person.name);
  const emailed = other.map((person) => person.name);

  return `Private to ${listed(['you', ...withYou])}; ${side.buyerTeam} cannot see this. ${listed(emailed)} ${emailed.length > 1 ? 'get' : 'gets'} an email.`;
}

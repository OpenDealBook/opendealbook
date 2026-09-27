export type TeamMember = {
  userId: string;
  role: string;
  roleHierarchyLevel: number;
  createdAt: string;
};

export type TeamInvitation = {
  id: number;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
};

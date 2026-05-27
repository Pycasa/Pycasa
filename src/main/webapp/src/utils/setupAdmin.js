
// This file is deprecated. Admin user is now managed directly via database migrations.
// See src/components/admin/AdminLogin.jsx for current implementation.

export const setupAdminUser = async () => {
  console.warn("setupAdminUser is deprecated.");
  return { success: false, error: "Deprecated" };
};

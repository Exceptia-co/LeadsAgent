"use client";

import { OrganizationList } from "@clerk/nextjs";

export function OrgPicker() {
  return (
    <OrganizationList
      hidePersonal={true}
      afterSelectOrganizationUrl="/dashboard"
      afterCreateOrganizationUrl="/dashboard"
    />
  );
}

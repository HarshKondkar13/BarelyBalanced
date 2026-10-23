import { getContext } from "@/server/context";
import { OnboardingWizard } from "./wizard";

export const metadata = { title: "Set up" };

export default async function OnboardingPage() {
  const { user, prefs } = await getContext();
  return <OnboardingWizard name={prefs?.displayName ?? user.name} />;
}

import { getContext } from "@/server/context";
import { PageHeader } from "@/components/ui";
import { HoldingForm } from "../holding-form";

export const metadata = { title: "Add holding" };

export default async function NewHoldingPage() {
  const { today } = await getContext();
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Add a holding" subtitle="Enter the value from your latest statement. The app never fetches prices or connects to brokers." />
      <HoldingForm id={null} today={today} />
    </div>
  );
}

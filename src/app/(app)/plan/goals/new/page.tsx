import { PageHeader } from "@/components/ui";
import { GoalForm } from "../goal-form";

export const metadata = { title: "Add goal" };

export default function NewGoalPage() {
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Add a goal" />
      <GoalForm id={null} />
    </div>
  );
}

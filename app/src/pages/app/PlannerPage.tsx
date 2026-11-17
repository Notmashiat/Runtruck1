import { RoutePlanner } from '../../components/RoutePlanner';

// Planner (release 1.41): the route planner — every truck across the week,
// its loads, deadhead and empty time, with Connect load and drag-to-reassign.
// It replaced the calendar planner.
export function PlannerPage() {
  return <RoutePlanner />;
}

// type WorkoutCompletionStatus = 'COMPLETED' | 'PARTIAL' | 'NOT_DONE';

// function getWorkoutCompletionStatus(
//   workoutPlan?: WorkoutExercise[]
// ): WorkoutCompletionStatus {
//   if (!workoutPlan || workoutPlan.length === 0) return 'NOT_DONE';

//   let totalExpectedSets = 0;
//   let totalLoggedSets = 0;

//   for (const ex of workoutPlan) {
//     totalExpectedSets += ex.idealSets || 0;
//     totalLoggedSets += ex.loggedSets?.length || 0;
//   }

//   if (totalLoggedSets === 0) return 'NOT_DONE';
//   if (totalLoggedSets >= totalExpectedSets) return 'COMPLETED';

//   return 'PARTIAL';
// }

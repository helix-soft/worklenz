import db from "../config/db";

export const MEETINGS_TASK_KIND = "meetings";
export const MEETINGS_TASK_NAME = "Meetings";

export interface IMeetingsTask {
  id: string;
  name: string;
}

/**
 * Returns the project's "Meetings" task (tasks.system_kind = 'meetings'), creating it on first use.
 * Calendar events logged from Home → Log Time go to this task, so the existing time reports keep
 * working. The task is left unassigned and without a due date so it never shows up in anyone's
 * My Tasks / Today's Priorities. Returns null when the project is not in the caller's team.
 */
export const ensureMeetingsTask = async (
  projectId: string,
  teamId: string,
  userId: string
): Promise<IMeetingsTask | null> => {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const project = await client.query(
      `SELECT id FROM projects WHERE id = $1::uuid AND team_id = $2::uuid`,
      [projectId, teamId]
    );
    if (!project.rows.length) {
      await client.query("ROLLBACK");
      return null;
    }

    // Serialises concurrent first uses for the same project.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`meetings-task:${projectId}`]);

    const existing = await client.query(
      `SELECT id, name FROM tasks WHERE project_id = $1::uuid AND system_kind = $2 LIMIT 1`,
      [projectId, MEETINGS_TASK_KIND]
    );
    if (existing.rows.length) {
      const task = existing.rows[0];
      // An archived Meetings task would hide logged time from reports; bring it back.
      await client.query(`UPDATE tasks SET archived = FALSE WHERE id = $1 AND archived IS TRUE`, [task.id]);
      await client.query("COMMIT");
      return { id: task.id, name: task.name };
    }

    const created = await client.query(`SELECT create_quick_task($1::json) AS task`, [
      JSON.stringify({ name: MEETINGS_TASK_NAME, project_id: projectId, reporter_id: userId }),
    ]);
    const taskId: string = created.rows[0]?.task?.id;
    if (!taskId) throw new Error("Failed to create the Meetings task");

    await client.query(`UPDATE tasks SET system_kind = $2 WHERE id = $1`, [taskId, MEETINGS_TASK_KIND]);
    // create_quick_task may auto-assign the creator; the Meetings task belongs to nobody.
    await client.query(`DELETE FROM tasks_assignees WHERE task_id = $1`, [taskId]);

    await client.query("COMMIT");
    return { id: taskId, name: MEETINGS_TASK_NAME };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

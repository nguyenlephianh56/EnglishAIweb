-- CHECK constraints

ALTER TABLE users
ADD CONSTRAINT users_email_lowercase_chk
CHECK (email = lower(email));

ALTER TABLE classes
ADD CONSTRAINT classes_code_format_chk
CHECK (code ~ '^[A-Z0-9]{6}$');

ALTER TABLE exercises
ADD CONSTRAINT exercises_content_object_chk
CHECK (jsonb_typeof(content) = 'object');

ALTER TABLE exercises
ADD CONSTRAINT exercises_answer_required_chk
CHECK (type IN ('writing', 'speaking') OR answer IS NOT NULL);

ALTER TABLE assignments
ADD CONSTRAINT assignments_remind_positive_chk
CHECK (0 < ALL (remind_before_hours));

ALTER TABLE attempts
ADD CONSTRAINT attempts_score_range_chk
CHECK (score IS NULL OR (score >= 0 AND score <= max_score));

ALTER TABLE attempts
ADD CONSTRAINT attempts_teacher_score_range_chk
CHECK (teacher_score IS NULL OR (teacher_score >= 0 AND teacher_score <= max_score));

ALTER TABLE attempts
ADD CONSTRAINT attempts_mode_chk
CHECK (mode IN ('practice', 'exam'));

ALTER TABLE skill_profiles
ADD CONSTRAINT skill_profiles_score_range_chk
CHECK (score >= 0 AND score <= 10);

ALTER TABLE exercise_reports
ADD CONSTRAINT exercise_reports_status_chk
CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED'));

ALTER TABLE ai_usage_logs
ADD CONSTRAINT ai_usage_logs_status_chk
CHECK (status IN ('ok', 'error', 'cached', 'rate_limited'));

-- Partial indexes

CREATE UNIQUE INDEX exercise_reports_one_open_per_user_idx
ON exercise_reports (exercise_id, reporter_id)
WHERE status <> 'RESOLVED';

CREATE INDEX notifications_unread_idx
ON notifications (user_id)
WHERE read_at IS NULL;

-- Updated_at trigger function

CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers

CREATE TRIGGER exercises_set_updated_at
BEFORE UPDATE ON exercises
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER skill_profiles_set_updated_at
BEFORE UPDATE ON skill_profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER prompt_templates_set_updated_at
BEFORE UPDATE ON prompt_templates
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
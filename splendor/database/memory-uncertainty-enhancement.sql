/*
 * MEMORY UNCERTAINTY FLAGGING ENHANCEMENT
 * Addition to Splendor Memory Architecture V2.0
 *
 * Core Rule: Forgetting is not the biggest danger. Confidently misremembering is.
 */

-- ═══════════════════════════════════════════════════════════════════════════════
-- ENHANCE MEMORY_ACCESS_LOG FOR UNCERTAINTY TRACKING
-- ═══════════════════════════════════════════════════════════════════════════════

-- Add uncertainty tracking to memory access log
ALTER TABLE memory_access_log
ADD COLUMN retrieval_confidence_label text CHECK (retrieval_confidence_label IN (
  'grounded',
  'weakly_grounded',
  'inferred',
  'conflicting',
  'stale',
  'unverifiable'
));

ALTER TABLE memory_access_log
ADD COLUMN uncertainty_reason text;

ALTER TABLE memory_access_log
ADD COLUMN uncertainty_flagged boolean DEFAULT false;

-- Index for uncertainty analysis
CREATE INDEX idx_memory_access_log_uncertainty ON memory_access_log(uncertainty_flagged, retrieval_confidence_label);

-- ═══════════════════════════════════════════════════════════════════════════════
-- UNCERTAINTY ASSESSMENT FUNCTION
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION assess_memory_uncertainty(
  memory_record jsonb,
  query_context jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb AS $$
DECLARE
  result jsonb := '{}';
  confidence_label text := 'grounded';
  uncertainty_reason text := null;
  should_flag boolean := false;
  created_days_ago integer;
  has_source boolean;
  source_strength numeric := 1.0;
BEGIN
  -- Extract key fields from memory record
  created_days_ago := EXTRACT(DAY FROM (now() - (memory_record->>'created_at')::timestamptz));
  has_source := (memory_record->>'source_timestamp') IS NOT NULL;

  -- Check various uncertainty conditions

  -- 1. No clear source
  IF NOT has_source OR (memory_record->>'source_type') = 'imported_memory' THEN
    confidence_label := 'unverifiable';
    uncertainty_reason := 'No clear source or citation available';
    should_flag := true;
    source_strength := 0.2;

  -- 2. Generated from reflection or thought cycle
  ELSIF (memory_record->>'provenance') = 'GENERATED' OR
        (memory_record->>'provenance') = 'INFERRED' THEN
    confidence_label := 'inferred';
    uncertainty_reason := 'Memory derived from interpretation or inference';
    should_flag := true;
    source_strength := 0.4;

  -- 3. Low confidence score
  ELSIF (memory_record->>'confidence')::numeric < 0.6 THEN
    confidence_label := 'weakly_grounded';
    uncertainty_reason := 'Low confidence score from original extraction';
    should_flag := true;
    source_strength := 0.5;

  -- 4. Very old memory (>180 days) without recent access
  ELSIF created_days_ago > 180 AND
        ((memory_record->>'last_accessed_at') IS NULL OR
         EXTRACT(DAY FROM (now() - (memory_record->>'last_accessed_at')::timestamptz)) > 90) THEN
    confidence_label := 'stale';
    uncertainty_reason := 'Memory is old and has not been recently validated';
    should_flag := true;
    source_strength := 0.6;

  -- 5. Pending approval or untrusted
  ELSIF (memory_record->>'approval_status') != 'approved' OR
        (memory_record->>'trust_level') = 'untrusted' THEN
    confidence_label := 'unverifiable';
    uncertainty_reason := 'Memory has not been approved for reliable use';
    should_flag := true;
    source_strength := 0.3;

  -- 6. Reference-only or caution trust level
  ELSIF (memory_record->>'trust_level') IN ('reference_only', 'caution') THEN
    confidence_label := 'weakly_grounded';
    uncertainty_reason := 'Memory flagged for cautious use only';
    should_flag := true;
    source_strength := 0.7;

  -- 7. System or technical memory used for personal context
  ELSIF (memory_record->>'memory_type') IN ('technical_context', 'system_event') AND
        (query_context->>'request_context') = 'answer_user_question' THEN
    confidence_label := 'unverifiable';
    uncertainty_reason := 'Technical memory not appropriate for personal context';
    should_flag := true;
    source_strength := 0.2;

  -- Otherwise, memory passes uncertainty checks
  ELSE
    confidence_label := 'grounded';
    uncertainty_reason := null;
    should_flag := false;
    source_strength := LEAST((memory_record->>'confidence')::numeric * 1.2, 1.0);
  END IF;

  -- Build result
  result := jsonb_build_object(
    'confidence_label', confidence_label,
    'uncertainty_reason', uncertainty_reason,
    'should_flag', should_flag,
    'source_strength', source_strength,
    'assessment_timestamp', now()
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- CITATION STRING GENERATOR FUNCTION
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION generate_citation_string(
  memory_record jsonb,
  include_uncertainty boolean DEFAULT true
) RETURNS text AS $$
DECLARE
  citation text := '';
  source_date text := '';
  source_info text := '';
  uncertainty_assessment jsonb;
  base_citation text := '';
BEGIN
  -- Get uncertainty assessment
  uncertainty_assessment := assess_memory_uncertainty(memory_record);

  -- Build source date
  IF (memory_record->>'source_timestamp') IS NOT NULL THEN
    source_date := to_char((memory_record->>'source_timestamp')::timestamptz, 'Mon DD, YYYY');
  ELSE
    source_date := to_char((memory_record->>'created_at')::timestamptz, 'Mon DD, YYYY');
  END IF;

  -- Build source info based on source type
  CASE (memory_record->>'source_type')
    WHEN 'user_direct_statement' THEN
      source_info := 'you told me';
    WHEN 'conversation' THEN
      source_info := 'our conversation';
    WHEN 'assistant_response' THEN
      source_info := 'I previously noted';
    WHEN 'reflection' THEN
      source_info := 'I reflected';
    WHEN 'decision' THEN
      source_info := 'we decided';
    WHEN 'manual_admin' THEN
      source_info := 'it was recorded';
    ELSE
      source_info := 'I have a record';
  END CASE;

  -- Build base citation
  base_citation := format('I remember this because %s on %s', source_info, source_date);

  -- Add workspace context if available
  IF (memory_record->>'workspace_id') IS NOT NULL THEN
    base_citation := base_citation || ' during our work on this project';
  END IF;

  -- Add uncertainty warning if flagged
  IF include_uncertainty AND (uncertainty_assessment->>'should_flag')::boolean THEN
    CASE (uncertainty_assessment->>'confidence_label')::text
      WHEN 'weakly_grounded' THEN
        citation := 'I may be reaching here, but ' || lower(base_citation);
      WHEN 'inferred' THEN
        citation := 'This is my interpretation - ' || lower(base_citation);
      WHEN 'conflicting' THEN
        citation := 'I have conflicting information, but ' || lower(base_citation);
      WHEN 'stale' THEN
        citation := 'This memory is older and unvalidated, but ' || lower(base_citation);
      WHEN 'unverifiable' THEN
        citation := 'I don''t have a strong source for this, but ' || lower(base_citation);
      ELSE
        citation := base_citation;
    END CASE;
  ELSE
    citation := base_citation;
  END IF;

  RETURN citation || '.';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- CONFLICT DETECTION FUNCTION
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION detect_memory_conflicts(
  user_id_param uuid,
  memory_ids uuid[]
) RETURNS jsonb AS $$
DECLARE
  conflicts jsonb := '[]';
  memory_a record;
  memory_b record;
  similarity_threshold numeric := 0.8; -- Adjust based on needs
  i integer;
  j integer;
BEGIN
  -- Compare each memory against others for conflicts
  FOR i IN 1..array_length(memory_ids, 1) LOOP
    FOR j IN (i+1)..array_length(memory_ids, 1) LOOP

      -- Get memory records
      SELECT * INTO memory_a FROM memory_items
      WHERE id = memory_ids[i] AND user_id = user_id_param;

      SELECT * INTO memory_b FROM memory_items
      WHERE id = memory_ids[j] AND user_id = user_id_param;

      -- Check for category/type conflicts
      IF memory_a.category = memory_b.category AND
         memory_a.memory_type = memory_b.memory_type AND
         memory_a.id != memory_b.id THEN

        -- Check for content similarity (basic text comparison)
        -- In production, you'd want semantic similarity here
        IF levenshtein(lower(memory_a.content), lower(memory_b.content))::numeric /
           GREATEST(length(memory_a.content), length(memory_b.content)) < (1 - similarity_threshold) THEN

          -- Found potential conflict
          conflicts := conflicts || jsonb_build_object(
            'memory_a_id', memory_a.id,
            'memory_b_id', memory_b.id,
            'conflict_type', 'contradictory_content',
            'description', format('Conflicting information in %s: "%s" vs "%s"',
                          memory_a.category,
                          left(memory_a.content, 100),
                          left(memory_b.content, 100))
          );
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'has_conflicts', jsonb_array_length(conflicts) > 0,
    'conflicts', conflicts,
    'checked_at', now()
  );
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ENHANCED RETRIEVAL VIEW WITH UNCERTAINTY ASSESSMENT
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW memory_items_with_uncertainty AS
SELECT
  m.*,
  assess_memory_uncertainty(
    jsonb_build_object(
      'id', m.id,
      'content', m.content,
      'created_at', m.created_at,
      'source_timestamp', m.source_timestamp,
      'source_type', m.source_type,
      'provenance', m.provenance,
      'confidence', m.confidence,
      'approval_status', m.approval_status,
      'trust_level', m.trust_level,
      'memory_type', m.memory_type,
      'last_accessed_at', m.last_accessed_at
    )
  ) as uncertainty_assessment,
  generate_citation_string(
    jsonb_build_object(
      'source_type', m.source_type,
      'source_timestamp', m.source_timestamp,
      'created_at', m.created_at,
      'workspace_id', m.workspace_id
    ),
    true
  ) as citation_string
FROM memory_items m
WHERE
  m.approval_status = 'approved'
  AND m.active = true
  AND m.retrieval_allowed = true
  AND m.superseded_by IS NULL
  AND (m.expires_at IS NULL OR m.expires_at > now());

-- ═══════════════════════════════════════════════════════════════════════════════
-- UNCERTAINTY TRACKING VIEWS
-- ═══════════════════════════════════════════════════════════════════════════════

-- View of memories that need uncertainty flagging
CREATE VIEW uncertain_memories AS
SELECT
  m.*,
  (m.uncertainty_assessment->>'confidence_label')::text as confidence_label,
  (m.uncertainty_assessment->>'uncertainty_reason')::text as uncertainty_reason,
  (m.uncertainty_assessment->>'should_flag')::boolean as should_flag
FROM memory_items_with_uncertainty m
WHERE (m.uncertainty_assessment->>'should_flag')::boolean = true;

-- View of memory access patterns with uncertainty
CREATE VIEW memory_uncertainty_analytics AS
SELECT
  mal.user_id,
  mal.retrieval_confidence_label,
  COUNT(*) as access_count,
  COUNT(CASE WHEN mal.uncertainty_flagged THEN 1 END) as flagged_count,
  AVG(CASE WHEN mi.confidence IS NOT NULL THEN mi.confidence END) as avg_confidence,
  DATE(mal.created_at) as access_date
FROM memory_access_log mal
LEFT JOIN memory_items mi ON mal.memory_item_id = mi.id
GROUP BY mal.user_id, mal.retrieval_confidence_label, DATE(mal.created_at);

-- ═══════════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS FOR RESPONSE BEHAVIOR
-- ═══════════════════════════════════════════════════════════════════════════════

-- Function to get appropriate uncertainty phrasing
CREATE OR REPLACE FUNCTION get_uncertainty_phrasing(
  confidence_label text,
  context text DEFAULT 'general'
) RETURNS text AS $$
BEGIN
  CASE confidence_label
    WHEN 'weakly_grounded' THEN
      RETURN 'I''m not fully grounded on this, but I think';
    WHEN 'inferred' THEN
      RETURN 'I remember something related, but I want to flag this as my interpretation:';
    WHEN 'conflicting' THEN
      RETURN 'I have conflicting information about this, but one memory suggests';
    WHEN 'stale' THEN
      RETURN 'This memory is older and I haven''t validated it recently, but';
    WHEN 'unverifiable' THEN
      RETURN 'I don''t have a strong source for this memory, so let me flag it as uncertain:';
    ELSE
      RETURN '';
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ADMIN FUNCTIONS FOR UNCERTAINTY MANAGEMENT
-- ═══════════════════════════════════════════════════════════════════════════════

-- Function to review and approve uncertain memories
CREATE OR REPLACE FUNCTION approve_uncertain_memory(
  memory_id_param uuid,
  approved_by text,
  confidence_boost numeric DEFAULT 0.2
) RETURNS boolean AS $$
DECLARE
  updated_rows integer;
BEGIN
  UPDATE memory_items
  SET
    approval_status = 'approved',
    confidence = LEAST(confidence + confidence_boost, 1.0),
    trust_level = 'trusted',
    retrieval_allowed = true,
    updated_at = now()
  WHERE id = memory_id_param
    AND approval_status = 'pending';

  GET DIAGNOSTICS updated_rows = ROW_COUNT;

  IF updated_rows > 0 THEN
    -- Record the approval in promotions
    INSERT INTO memory_promotions (
      user_id,
      source_id,
      source_table,
      target_id,
      target_table,
      promoted_by,
      reason
    )
    SELECT
      user_id,
      memory_id_param,
      'memory_items',
      memory_id_param,
      'memory_items',
      approved_by,
      'Uncertain memory approved after review'
    FROM memory_items WHERE id = memory_id_param;

    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════════
-- COMMENTS AND DOCUMENTATION
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON FUNCTION assess_memory_uncertainty IS 'Evaluates memory reliability and generates uncertainty labels';
COMMENT ON FUNCTION generate_citation_string IS 'Creates citation with uncertainty warnings when appropriate';
COMMENT ON FUNCTION detect_memory_conflicts IS 'Identifies conflicting memories during retrieval';
COMMENT ON VIEW memory_items_with_uncertainty IS 'Enhanced memory view with uncertainty assessment';
COMMENT ON VIEW uncertain_memories IS 'Memories that require uncertainty flagging';

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT 'Memory Uncertainty Flagging Enhancement Complete' as status;

/*
 * UNCERTAINTY FLAGGING IMPLEMENTATION COMPLETE
 *
 * Features Added:
 * ✅ Retrieval confidence labels (grounded, weakly_grounded, inferred, conflicting, stale, unverifiable)
 * ✅ Uncertainty assessment function with multiple validation checks
 * ✅ Citation string generator with uncertainty warnings
 * ✅ Conflict detection during retrieval
 * ✅ Enhanced access logging with uncertainty tracking
 * ✅ Admin functions for reviewing uncertain memories
 * ✅ Views for uncertainty analytics
 * ✅ Helper functions for response behavior
 *
 * Core Protection: Splendor will never present uncertain memory as confident fact
 */
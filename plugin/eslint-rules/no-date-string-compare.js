/**
 * ESLint Custom Rule: no-date-string-compare
 * Forbids string-literal comparison operators on fields/variables known to hold date-typed values.
 * Closes gate-22 H-8 (lex ISO compare issue).
 *
 * Detection strategy:
 * - Flag binary expressions with comparison operators (<, >, <=, >=) where either operand:
 *   - Is a member access (e.g., foo.ts, entry.ts, row.ts) and the identifier suggests a timestamp (ts, timestamp, since, until, createdAt, updatedAt)
 *   - Is a variable identifier whose name suggests a timestamp
 *
 * Rationale:
 * ISO 8601 timestamps use string format, but lexicographic comparison breaks on:
 *   - Timezone offset variants: '+00:00' vs 'Z' ('+' < 'Z' in ASCII)
 *   - Milliseconds optional: '2026-04-26T00:00:00Z' vs '2026-04-26T00:00:00.000Z'
 * Always use numeric ms comparison via Date.getTime() or dedicated compareTimestamps() helper.
 */

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid string-literal comparison of ISO 8601 timestamps. Use numeric comparison via Date.getTime() or compareTimestamps().',
      category: 'Correctness',
      recommended: 'error',
    },
    fixable: null,
    messages: {
      noDateStringCompare:
        'Comparison of timestamp field "{{ field }}" using lexicographic operator "{{ operator }}". ' +
        'ISO 8601 string comparison is unsafe (timezone offset variants, optional milliseconds). ' +
        'Use numeric comparison: new Date({{ field }}).getTime() {{ operator }} new Date({{ other }}).getTime() ' +
        'or use compareTimestamps() helper.',
    },
  },

  create(context) {
    const dateFieldPatterns = [
      /^ts$/i,
      /timestamp/i,
      /since/i,
      /until/i,
      /createdAt/i,
      /updatedAt/i,
      /publishedAt/i,
      /deletedAt/i,
      /expiresAt/i,
    ];

    function isDateField(name) {
      return dateFieldPatterns.some((pattern) => pattern.test(name));
    }

    function getFieldName(node) {
      if (node.type === 'MemberExpression') {
        // foo.ts, entry.timestamp, row.since → extract the property name
        const prop = node.property;
        if (prop.type === 'Identifier') {
          return prop.name;
        }
      } else if (node.type === 'Identifier') {
        return node.name;
      }
      return null;
    }

    return {
      BinaryExpression(node) {
        const ops = ['<', '>', '<=', '>='];
        if (!ops.includes(node.operator)) {
          return;
        }

        const leftField = getFieldName(node.left);
        const rightField = getFieldName(node.right);

        // Flag if either side is a date field
        if (leftField && isDateField(leftField)) {
          context.report({
            node,
            messageId: 'noDateStringCompare',
            data: {
              field: leftField,
              operator: node.operator,
              other: rightField || 'otherValue',
            },
          });
        } else if (rightField && isDateField(rightField)) {
          context.report({
            node,
            messageId: 'noDateStringCompare',
            data: {
              field: rightField,
              operator: node.operator,
              other: leftField || 'otherValue',
            },
          });
        }
      },
    };
  },
};

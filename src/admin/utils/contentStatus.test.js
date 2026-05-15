import {
  adaptStudyItemContent,
  computeStatusMap,
  getStructuredContentPath,
  hasLegacyContent,
  hasPublishedStructuredContent,
  hasStructuredContent,
} from './contentStatus';

const buildChildrenByTopicId = (nodes) => {
  const children = new Map();
  nodes.forEach((node) => {
    if (!node.parentId) return;
    const list = children.get(node.parentId) || [];
    list.push(node);
    children.set(node.parentId, list);
  });
  return children;
};

describe('admin content status', () => {
  it('does not mark a legacy-only child as structured content', () => {
    const nodes = [
      { id: '1.2', topicId: '1.2', name: 'MAMMOGRAPHY' },
      {
        id: '1.2.2',
        topicId: '1.2.2',
        parentId: '1.2',
        name: 'Mammography Projections',
        mainContent: { ops: [{ insert: 'Legacy rich text exists.' }] },
      },
    ];

    const statusMap = computeStatusMap(nodes, buildChildrenByTopicId(nodes));

    expect(hasLegacyContent(nodes[1])).toBe(true);
    expect(hasPublishedStructuredContent(nodes[1])).toBe(false);
    expect(statusMap['1.2.2']).toBe('yellow');
    expect(statusMap['1.2']).toBe('yellow');
  });

  it('marks a node with hasStructuredContent true as green', () => {
    const nodes = [
      {
        id: '1.2',
        topicId: '1.2',
        name: 'MAMMOGRAPHY',
        hasStructuredContent: true,
      },
    ];

    const statusMap = computeStatusMap(nodes, buildChildrenByTopicId(nodes));

    expect(statusMap['1.2']).toBe('green');
  });

  it('marks a node with contentSectionsCount as green', () => {
    const nodes = [
      {
        id: '1.2',
        topicId: '1.2',
        name: 'MAMMOGRAPHY',
        contentSectionsCount: 7,
      },
    ];

    const statusMap = computeStatusMap(nodes, buildChildrenByTopicId(nodes));

    expect(statusMap['1.2']).toBe('green');
  });

  it('marks missing metadata with discovered content section count as green', () => {
    const nodes = [
      {
        id: '1.2',
        topicId: '1.2',
        name: 'MAMMOGRAPHY',
      },
    ];

    const statusMap = computeStatusMap(nodes, buildChildrenByTopicId(nodes), { '1.2': 7 });

    expect(hasStructuredContent(nodes[0], { '1.2': 7 })).toBe(true);
    expect(statusMap['1.2']).toBe('green');
  });

  it('marks study_items structured fallback as green', () => {
    const nodes = [
      {
        id: '1.2.4',
        topicId: '1.2.4',
        name: 'Normal Mammographic Anatomy',
      },
    ];

    const statusMap = computeStatusMap(nodes, buildChildrenByTopicId(nodes), {
      '1.2.4': { structuredCount: 5, legacy: false, source: 'study_items:structured' },
    });

    expect(statusMap['1.2.4']).toBe('green');
  });

  it('marks study_items legacy fallback as yellow', () => {
    const nodes = [
      {
        id: '1.2.4',
        topicId: '1.2.4',
        name: 'Normal Mammographic Anatomy',
      },
    ];

    const statusMap = computeStatusMap(nodes, buildChildrenByTopicId(nodes), {
      '1.2.4': { structuredCount: 0, legacy: true, source: 'study_items:legacy' },
    });

    expect(statusMap['1.2.4']).toBe('yellow');
  });

  it('marks a parent with direct structured content green without marking children green', () => {
    const nodes = [
      {
        id: '1.2',
        topicId: '1.2',
        name: 'MAMMOGRAPHY',
        hasStructuredContent: true,
        contentSectionsCount: 3,
      },
      {
        id: '1.2.2',
        topicId: '1.2.2',
        parentId: '1.2',
        name: 'Mammography Projections',
      },
    ];

    const statusMap = computeStatusMap(nodes, buildChildrenByTopicId(nodes));

    expect(statusMap['1.2']).toBe('green');
    expect(statusMap['1.2.2']).toBe('grey');
  });

  it('marks a child green when the same node has published structured content metadata', () => {
    const nodes = [
      { id: '1.2', topicId: '1.2', name: 'MAMMOGRAPHY' },
      {
        id: '1.2.2',
        topicId: '1.2.2',
        parentId: '1.2',
        name: 'Mammography Projections',
        hasStructuredContent: true,
        contentSectionsCount: 2,
      },
    ];

    const statusMap = computeStatusMap(nodes, buildChildrenByTopicId(nodes));

    expect(statusMap['1.2.2']).toBe('green');
    expect(statusMap['1.2']).toBe('yellow');
  });

  it('reconciles selected editor-loaded sections when metadata is missing', () => {
    const node = {
      id: '1.2',
      topicId: '1.2',
      name: 'MAMMOGRAPHY',
    };

    expect(hasPublishedStructuredContent(node)).toBe(false);
    expect(hasStructuredContent(node, { '1.2': 7 })).toBe(true);
  });

  it('uses the editor contentSections path as the structured content path', () => {
    expect(getStructuredContentPath('breast', '1.2.2')).toBe(
      'sections/breast/nodes/1.2.2/contentSections',
    );
  });

  it('adapts structured study_items documents into editor topic shape', () => {
    const adapted = adaptStudyItemContent({
      objectives: ['Understand anatomy'],
      sections: [{ title: 'Anatomy', body_md: 'Body', checkpoints: [] }],
      key_points: ['TDLU matters'],
    });

    expect(adapted.schemaType).toBe('structured');
    expect(adapted.structuredContent.sections).toHaveLength(1);
    expect(adapted.structuredContent.objectives).toEqual(['Understand anatomy']);
  });

  it('treats planner-only study_items documents as metadata-only', () => {
    const adapted = adaptStudyItemContent({
      itemId: '1.2.4',
      section: 'Breast',
      name: 'Normal Mammographic Anatomy',
      estimatedMinutes: 10,
    });

    expect(adapted.schemaType).toBe('metadata-only');
    expect(adapted.structuredContent).toBeNull();
    expect(adapted.legacyText).toBe('');
  });
});

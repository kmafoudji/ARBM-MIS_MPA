# 0010 — The import loads a Theory of Change only when the tree is complete; fan-in becomes cross-pathways

## Context

The AS-IS workbooks carry the PAD's Theory of Change in a sheet marked
parked (`99b_toc_nodes_parked`), and the importer ignores it. It was parked
because the model roots the causal chain at Activity and enforces strict
level adjacency (`PARENT_LEVEL`, `create_toc_node()`), while the two legacy
PADs (SLE1013, NGA1007) hang outputs straight off intermediate outcomes and
name no activities at all. Loading them would mean inventing nodes.

Two things follow from the parking and were not intended. Every workbook
inherits it, including SLE1031, whose source tree is a complete 5-level
tree of 89 nodes. And the Logframe tab stays locked on imported projects,
because it opens only when the project has at least one ToC node.

The sheet is written top-down: `parent_ref` names the node one level up,
and several nodes may name the same one. The model reads the other way:
`ToCNode.parent` is the contributor one level down, and a node has exactly
one. A PAD tree inverted into the model therefore has nodes with several
would-be parents.

## Decision

- `06_toc_nodes` is an optional sheet of the AS-IS workbook, with the
  columns of the parked sheet (`node_ref`, `chain_level`, `parent_ref`,
  `statement`, `assumptions`). `99b_toc_nodes_parked` stays ignored:
  renaming the sheet is the explicit opt-in.
- The sheet is loaded only when the tree is complete: every node below the
  ultimate outcome has a `parent_ref` exactly one level up, and every node
  above Activity has at least one contributor. Otherwise each gap is a
  warning and the sheet is skipped as a whole; the rest of the workbook
  loads as usual. A partial Theory of Change is worse than none.
- Fan-in is kept without duplicating or inventing nodes: the first
  contributor in file order becomes `parent`; every other contributor is a
  `cross_pathways` link from contributor to target (RG-2.6).
- The ultimate outcome is not a node. Its statement is written to
  `TheoryOfChange.ultimate_outcome`, where the ToC page shows it.
- `07_indicators_logframe.toc_node_ref` sets `ToCNode.logframe_row`, one
  indicator per node.
- Nodes have no key column, so the tree is synced by content as a whole:
  an identical tree is reported unchanged and left alone; any difference
  deletes every stored node, visibly, and recreates the file's tree.

## Consequences

- SLE1031 loads its Theory of Change (88 nodes, 22 of them with a
  cross-pathway, 22 linked to logframe rows) once its parked sheet is
  renamed, and its Logframe tab opens.
- SLE1013 and NGA1007 stay without a Theory of Change. Their sheets would
  be skipped with one warning per output. Giving them one is a modelling
  task on the PAD side, not an import setting.
- A re-import that changes any node regenerates every code and drops the
  `logframe_row` and cross-pathway links added by hand since; the report
  says so before the commit.
- The question of whether the model should allow level-skipping is not
  reopened: the import follows the model's rule and reports what does not
  fit.

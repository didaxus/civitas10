# Canonical vocabulary

The canonical registry is `contracts/authorization/data-scope-dimensions.yaml`.

Required distinctions: grade level is not a score, stage, cohort, or class; tertiary year level is not K-12 grade level; academic year is not a concrete term; term is not term type; intersession is a term or term-type value, not an organization; faculty, academic department, program, program level, credential level, and program version are distinct; institution region is not government geography; course, subject, cohort, and class are distinct.

`academic.period` is deprecated as ambiguous. Legacy rows using it are reconciliation-required unless a tenant-owned human decision maps them to `academic.school_year`, `academic.term`, or `academic.term_type`.

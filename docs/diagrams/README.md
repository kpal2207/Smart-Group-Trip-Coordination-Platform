# ConvoySync Architecture Diagrams

This directory contains individual Draw.io diagram files for ConvoySync (IT-314 Software Engineering, Group 8).

Each file can be opened directly in [app.diagrams.net](https://app.diagrams.net), VS Code Draw.io extension, or viewed on GitHub.

| File Name | Diagram Type | Description |
| :--- | :--- | :--- |
| **[`conceptual_erd.drawio`](conceptual_erd.drawio)** | **Conceptual ERD** | Domain-level Entity-Relationship Model showing business entities (`USER`, `TRIP`, `EXPENSE`, `TELEMETRY`, `SOS`) and relationships. |
| **[`relational_schema.drawio`](relational_schema.drawio)** | **Relational Schema** | Physical database schema showing all tables, primary keys, foreign keys (`ON DELETE CASCADE`), data types, and composite indexes. |
| **[`uml_class_diagram.drawio`](uml_class_diagram.drawio)** | **UML Class Diagram** | ORM code structure showing SQLAlchemy declarative models, attributes, types, and associations. |
| **[`uml_sequence_diagram.drawio`](uml_sequence_diagram.drawio)** | **UML Sequence Diagram** | Chronological messaging flow for GPS Telemetry ingestion and velocity-adaptive map polling. |
| **[`uml_state_diagram.drawio`](uml_state_diagram.drawio)** | **UML State Diagram** | Entity lifecycles and state transitions for Expense Disputes, Trip Settlements, and Emergency SOS Siren. |
| **[`uml_activity_diagram.drawio`](uml_activity_diagram.drawio)** | **UML Activity Diagram** | End-to-end user workflow: Trip creation, duplicate-safe joining, expense splitting, and UPI settlement. |

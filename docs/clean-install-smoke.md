# Clean Install Smoke Test

Use this checklist after `npm run package:vsix` to verify that the packaged extension is demo-safe and installable.

## Environment

- Use VS Code with a clean profile or Extension Development Host
- Install the generated `uml-orm-refactor-*.vsix`
- Open a workspace folder where test artifacts can be created

## Workflow

1. Confirm the `UML to ORM` activity bar view appears.
2. Confirm `Generate ORM Code`, `Generate Repository`, `Generate DDL`, `Import Schema`, `Export to XMI`, and `Import from XMI` appear in the Command Palette.
3. Create or open a `.orm.json` diagram.
4. Add at least two entities and one association.
5. Run `Generate ORM Code` and verify the output file opens without errors.
6. Run `Generate Repository` and verify the output file opens without errors.
7. Run `Generate DDL` and verify the `.sql` file opens without errors.
8. Run `Import Schema` on one of the generated ORM files and verify that a new diagram file is created.
9. Run `Export to XMI` on the diagram and save the file.
10. Run `Import from XMI` and verify that the imported diagram opens successfully.
11. If the import path surfaces diagnostics, verify that the message includes parser kind and confidence details.

## Expected Result

- All commands execute without crashes
- Generated files are saved to disk and open in editors
- The imported diagram remains editable
- Diagnostics are visible when the parser only partially recovers handwritten input
- No manual recovery step is required before a defense or demo

# Pequod Stack Management Multilanguage Component
This multilanguage component is used to manage various stack settings when launching stacks in the pequod organization via new project wizard.
It ensures stacks are configured as follows:
* A time-to-live schedule is set.
* A "drift with remediation" schedule is set
* The delete_stack stack tag is set so the stack, project and repo are automatically cleaned up overnight.
* Adds the stack to the DevTeam team.

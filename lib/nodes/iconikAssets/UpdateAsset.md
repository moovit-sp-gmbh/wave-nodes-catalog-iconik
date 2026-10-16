::wavedoc
---
title: Update Asset
description: |
  The Update Asset node changes the basic fields of one asset in Iconik: title, external ID, external link, category, site name and warning. Only the fields you fill in are sent; every field left empty keeps its current value in Iconik. Because an empty input means "keep", this node cannot clear a field. At least one field must be filled in, otherwise the node fails before a request is sent. The values sent replace the current ones; the node keeps no copy of the old values. Iconik's asset schema lists the title as required, so when Asset Title is empty the node first reads the asset and sends its current title back unchanged; Updated fields still lists only the fields you filled in. The node ends on Success when Iconik confirms the change. Metadata fields are changed with Set Metadata, and assets are deleted with Delete Asset. The node authenticates with an Iconik App ID and Auth Token; wire both from Get Secret nodes. Iconik requires the can_write_assets role, and can_read_assets when Asset Title is empty. When Iconik rate-limits the request (429), the node tries again, up to 3 attempts in total.
inputs:
  - name: App ID
    description: |
      Enter the app ID for the Iconik API. Leading and trailing spaces are removed. Replaced by a placeholder in the Curl output
    type: STRING_PASSWORD
    mandatory: true
    example:
      - name: App ID
        value: "example-app-id"
  - name: Auth Token
    description: |
      Enter the auth token for the Iconik API that belongs to the App ID. Leading and trailing spaces are removed. Replaced by a placeholder in the Curl output and in error messages
    type: STRING_PASSWORD
    mandatory: true
    example:
      - name: Auth Token
        value: "example-auth-token"
  - name: Asset ID
    description: |
      Enter the ID of the asset to change, for example from a webhook payload or the Upload File node. It must be a UUID (36 characters with hyphens, upper or lower case); leading and trailing spaces are removed
    type: STRING
    mandatory: true
    example:
      - name: Asset ID
        value: "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b"
  - name: Asset Title
    description: |
      Enter the new title of the asset. Leading and trailing spaces are removed; leave it empty to keep the current title
    type: STRING
    mandatory: false
    example:
      - name: Asset Title
        value: "Interview Final 01"
  - name: External ID
    description: |
      Enter the new reference to the asset in an external system, such as a project or order number. Leave it empty to keep the current value
    type: STRING
    mandatory: false
    example:
      - name: External ID
        value: "PRJ-4711"
  - name: External Link
    description: |
      Enter the new URL the asset points to. It must be a full URL with a scheme such as https://; leave it empty to keep the current link
    type: STRING
    mandatory: false
    example:
      - name: External Link
        value: "https://example.com/media/interview-final-01"
  - name: Asset Category
    description: |
      Enter the new category of the asset. Leave it empty to keep the current category
    type: STRING
    mandatory: false
    advanced: true
    example:
      - name: Asset Category
        value: "Interviews"
  - name: Site Name
    description: |
      Enter the new site name of the asset. Leave it empty to keep the current site name
    type: STRING
    mandatory: false
    advanced: true
    example:
      - name: Site Name
        value: "helmut"
  - name: Asset Warning
    description: |
      Enter a warning text that Iconik shows on the asset. Leave it empty to keep the current warning
    type: STRING
    mandatory: false
    advanced: true
    example:
      - name: Asset Warning
        value: "Rights expire on 2026-12-31"
  - name: Iconik URL
    description: |
      Enter the base URL of the Iconik instance, starting with http:// or https://. Leave it empty to use https://app.iconik.io, the default. Trailing slashes are removed
    type: STRING
    mandatory: false
    advanced: true
    example:
      - name: Iconik URL
        value: "https://app.iconik.io"
outputs:
  - name: Asset ID
    description: |
      Returns the ID of the changed asset as Iconik returns it, or the entered Asset ID when the response has none. Stays empty when the node fails
    type: STRING
    example:
      - name: Asset ID
        value: "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b"
  - name: Updated fields
    description: |
      Returns the Iconik names of the fields that were sent, in the order title, external_id, external_link, category, site_name, warning. Stays empty when the node fails
    type: STRING_LIST
    example:
      - name: Updated fields
        value: '["title", "warning"]'
  - name: Asset
    description: |
      Returns Iconik's response unchanged: the full asset object after the change, with fields such as id, title, status and warning. Stays empty when the node fails
    type: JSON
    example:
      - name: Asset
        value: |
          {
            "id": "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b",
            "title": "Interview Final 01",
            "status": "ACTIVE",
            "warning": "Rights expire on 2026-12-31"
          }
  - name: Curl
    description: |
      Returns the last request sent as a curl command, with placeholders in place of the App ID and Auth Token: the update request, or the read of the current title when that fails. It is set before each request is sent, so it also holds a value when Iconik rejects a request; it stays empty when an input check fails first
    type: STRING
    example:
      - name: Curl
        value: |
          curl -X PATCH \
            -H "App-ID: <your-app-id>" \
            -H "Auth-Token: <your-auth-token>" \
            -H "Content-Type: application/json" \
            -H "Accept: application/json" \
            -d '{"title":"Interview Final 01"}' \
            -L --max-redirs 5 \
            "https://app.iconik.io/API/assets/v1/assets/7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b/"
connectors:
  - name: Success
    description: |
      Triggered when Iconik confirms the change with a 2xx status, including after a rate-limited attempt was retried
  - name: Fail
    description: |
      Triggered when an input check fails or Iconik does not apply the change. When an input check fails, nothing is sent to Iconik. Every error Iconik reports is shown as "Iconik returned <status>: <Iconik's error text>"
    causes:
      - name: Invalid Input
        description: |
          If Asset ID is not a UUID, none of the fields to change is filled in, or External Link is set but not a full URL
      - name: Request Rejected
        description: |
          If Iconik answers 400. The message shows Iconik's reason unchanged
      - name: Authentication Failed
        description: |
          If the App ID or Auth Token is empty, or Iconik answers 401 or 403
      - name: Not Found
        description: |
          If Iconik answers 404, which it documents for an asset that does not exist. The message names the Asset ID that was used
      - name: Rate Limited
        description: |
          If Iconik still answers 429 on the third attempt. Between attempts the node waits as long as Iconik's Retry-After header says, at most 60 seconds, or 1 second and then 2 seconds when the header is missing
      - name: Connection Error
        description: |
          If the Iconik URL is not a valid http:// or https:// URL, Iconik cannot be reached, or Iconik does not answer within 30 seconds
      - name: Canceled
        description: |
          If the stream is canceled while the node waits to retry a rate-limited request
      - name: API Error
        description: |
          If Iconik answers with any other non-2xx status
---
::

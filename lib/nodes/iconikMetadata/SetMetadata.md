::wavedoc
---
title: Set Metadata
description: |
  The Set Metadata node writes metadata values to one asset or collection in Iconik through a metadata view, for example to set a status, write a QC result or add keywords after a processing step. It sends a single update request to Iconik and ends on Success only when Iconik accepts it. In Overwrite mode, the values a field held before are replaced, and the node keeps no copy of them. The node authenticates with an Iconik App ID and Auth Token; wire both from Get Secret nodes. Iconik requires the can_write_metadata_values role for this request. The Object ID usually comes from the payload of an Iconik webhook or custom action. Before anything is sent, the node checks that Object ID and View ID are UUIDs and that Metadata is a non-empty JSON object. When Iconik rate-limits the request (429), the node tries again, up to 3 attempts in total. Iconik has no error codes of its own, so every error Iconik reports is shown with Iconik's HTTP status and Iconik's own error text, unchanged.
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
  - name: Object Type
    description: |
      Choose whether Object ID identifies an asset or a collection. Assets is the default
    type: STRING_SELECT
    mandatory: false
    options:
      - name: Assets
        description: |
          Writes to the Iconik asset with this Object ID
        default: true
      - name: Collections
        description: |
          Writes to the Iconik collection with this Object ID
    example:
      - name: Object Type
        value: "Assets"
  - name: Object ID
    description: |
      Enter the ID of the asset or collection, for example from the payload of an Iconik webhook or custom action. It must be a UUID (36 characters with hyphens, upper or lower case); leading and trailing spaces are removed
    type: STRING
    mandatory: true
    example:
      - name: Object ID
        value: "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b"
  - name: View ID
    description: |
      Enter the ID of the Iconik metadata view that contains the fields to write. It must be a UUID (36 characters with hyphens, upper or lower case); leading and trailing spaces are removed
    type: STRING
    mandatory: true
    example:
      - name: View ID
        value: "0d9e8f7a-6b5c-4d3e-2f1a-0b9c8d7e6f5a"
  - name: Metadata
    description: |
      Enter the fields to write as a JSON object, or wire a payload wildcard that holds such an object. Each key is the internal field name in Iconik, matched case-sensitively, not the display label. Each value is text, a number, true/false, or a list of these; a single value is sent as a one-item list. In Overwrite mode, an empty list [] or null clears the field; in Append and Delete mode, every field needs at least one value
    type: STRING_LONG
    mandatory: true
    example:
      - name: Metadata
        value: |
          {
            "Description": "Final cut, approved by client",
            "Keywords": ["Summer", "Beach"]
          }
  - name: Iconik URL
    description: |
      Enter the base URL of the Iconik instance, starting with http:// or https://. Leave it empty to use https://app.iconik.io, the default. Trailing slashes are removed
    type: STRING
    mandatory: false
    advanced: true
    example:
      - name: Iconik URL
        value: "https://app.iconik.io"
  - name: Mode
    description: |
      Choose how the values are written. The mode applies to every field in Metadata. Overwrite is the default
    type: STRING_SELECT
    mandatory: false
    advanced: true
    options:
      - name: Overwrite
        description: |
          Replaces the field's values with the given ones; [] or null clears the field
        default: true
      - name: Append
        description: |
          Adds the given values to the field
      - name: Delete
        description: |
          Removes the given values from the field
    example:
      - name: Mode
        value: "Overwrite"
  - name: Ignore Unchanged
    description: |
      Enable to send Iconik ignore_unchanged=true, which asks Iconik to skip values that are already set. Enabled by default; when disabled, Iconik receives ignore_unchanged=false
    type: BOOLEAN
    mandatory: false
    advanced: true
    example:
      - name: Ignore Unchanged
        value: true
outputs:
  - name: Object ID
    description: |
      Returns the Object ID that was written to, with leading and trailing spaces removed. Stays empty when the node fails
    type: STRING
    example:
      - name: Object ID
        value: "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b"
  - name: Metadata
    description: |
      Returns Iconik's response unchanged: metadata_values holds the values Iconik returns for this object and view, keyed by field name, each with its field_values list, next to object_id and object_type. Stays empty when the node fails
    type: JSON
    example:
      - name: Metadata
        value: |
          {
            "object_id": "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b",
            "object_type": "assets",
            "date_modified": "2026-10-15T10:00:00Z",
            "metadata_values": {
              "Description": { "field_values": [{ "value": "Final cut, approved by client" }] },
              "Keywords": { "field_values": [{ "value": "Summer" }, { "value": "Beach" }] }
            }
          }
  - name: Curl
    description: |
      Returns the request as a curl command, with placeholders in place of the App ID and Auth Token. It is set before the request is sent, so it also holds a value when Iconik rejects the request; it stays empty when an input check fails first
    type: STRING
    example:
      - name: Curl
        value: |
          curl -X PUT \
            -H "App-ID: <your-app-id>" \
            -H "Auth-Token: <your-auth-token>" \
            -H "Content-Type: application/json" \
            -H "Accept: application/json" \
            -d '{"metadata_values":{"Description":{"mode":"overwrite","field_values":[{"value":"Final cut, approved by client"}]}}}' \
            -L --max-redirs 5 \
            "https://app.iconik.io/API/metadata/v1/assets/7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b/views/0d9e8f7a-6b5c-4d3e-2f1a-0b9c8d7e6f5a/?ignore_unchanged=true"
connectors:
  - name: Success
    description: |
      Triggered when Iconik accepts the update with a 2xx status, including after a rate-limited attempt was retried
  - name: Fail
    description: |
      Triggered when an input check fails or Iconik does not accept the update. When an input check fails, nothing is sent to Iconik. Every error Iconik reports is shown as "Iconik returned <status>: <Iconik's error text>", e.g. "Iconik returned 400: Rating: Not a valid integer."
    causes:
      - name: Invalid Input
        description: |
          If Object ID or View ID is not a UUID, Object Type or Mode has a value that is not one of its options, or Metadata is empty, not valid JSON, not a JSON object, has no fields, holds a value that is not text, a number, true/false or a list of these, or has a field without values in Append or Delete mode
      - name: Request Rejected
        description: |
          If Iconik answers 400. The message shows Iconik's reason unchanged
      - name: Authentication Failed
        description: |
          If the App ID or Auth Token is empty, or Iconik answers 401 or 403
      - name: Not Found
        description: |
          If Iconik answers 404. Iconik documents this status for a metadata view that does not exist. The message names the Object Type, Object ID and View ID that were used
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

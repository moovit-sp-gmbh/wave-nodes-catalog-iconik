::wavedoc
---
title: Get Metadata
description: |
  The Get Metadata node reads the metadata of one asset or collection in Iconik for one metadata view; the view decides which fields are returned. It converts Iconik's format into a simple object for the Metadata output, where each field holds one value, a list of values, or null, and keeps Iconik's own format in the Metadata values output. Field names stay Iconik's internal names, matched case-sensitively, the same names Set Metadata expects. The node changes nothing in Iconik. It ends on Success when Iconik returns the values. Iconik answers 404 when nothing is stored yet for this object and view; the node then checks that the view exists and, if it does, ends on Success with empty metadata. It does not check that the object exists, so an unknown Object ID also gives empty metadata. It authenticates with an Iconik App ID and Auth Token; wire both from Get Secret nodes. Iconik requires the can_read_metadata_values role, and can_read_metadata_views for the check after a 404. When Iconik rate-limits the request (429), the node tries again, up to 3 attempts in total.
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
          Reads the metadata of the Iconik asset with this Object ID
        default: true
      - name: Collections
        description: |
          Reads the metadata of the Iconik collection with this Object ID
    example:
      - name: Object Type
        value: "Assets"
  - name: Object ID
    description: |
      Enter the ID of the asset or collection, for example from the payload of an Iconik webhook or from Get Asset or Search. It must be a UUID (36 characters with hyphens, upper or lower case); leading and trailing spaces are removed
    type: STRING
    mandatory: true
    example:
      - name: Object ID
        value: "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b"
  - name: View ID
    description: |
      Enter the ID of the Iconik metadata view whose fields to read. It must be a UUID (36 characters with hyphens, upper or lower case); leading and trailing spaces are removed
    type: STRING
    mandatory: true
    example:
      - name: View ID
        value: "0d9e8f7a-6b5c-4d3e-2f1a-0b9c8d7e6f5a"
  - name: Iconik URL
    description: |
      Enter the base URL of the Iconik instance, starting with http:// or https://. Leave it empty to use https://app.iconik.io, the default. Trailing slashes are removed
    type: STRING
    mandatory: false
    advanced: true
    example:
      - name: Iconik URL
        value: "https://app.iconik.io"
  - name: Values as Text
    description: |
      Enable to send Iconik reencode_values_to_string=true, which asks Iconik to return every value as text. Disabled by default
    type: BOOLEAN
    mandatory: false
    advanced: true
    example:
      - name: Values as Text
        value: false
outputs:
  - name: Object ID
    description: |
      Returns the Object ID that was read, with leading and trailing spaces removed. Stays empty when the node fails
    type: STRING
    example:
      - name: Object ID
        value: "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b"
  - name: Metadata
    description: |
      Returns one entry per field Iconik returned: the value itself when the field has one value, a list when it has several, and null when it has none. A multi-value field that holds a single value therefore appears as that value, not as a one-item list. An empty object when nothing is stored yet. Stays empty when the node fails
    type: JSON
    example:
      - name: Metadata
        value: |
          {
            "Description": "Final cut, approved by client",
            "Keywords": ["Summer", "Beach"],
            "Rating": null
          }
  - name: Field names
    description: |
      Returns the names of the fields in Metadata, in the order Iconik returned them. Stays empty when the node fails
    type: STRING_LIST
    example:
      - name: Field names
        value: '["Description", "Keywords", "Rating"]'
  - name: Metadata values
    description: |
      Returns Iconik's response unchanged: metadata_values holds each field with its field_values list, next to object_id and object_type. When nothing is stored yet, there is no Iconik response and it holds only an empty metadata_values object. Stays empty when the node fails
    type: JSON
    example:
      - name: Metadata values
        value: |
          {
            "object_id": "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b",
            "object_type": "assets",
            "metadata_values": {
              "Description": { "field_values": [{ "value": "Final cut, approved by client" }] },
              "Keywords": { "field_values": [{ "value": "Summer" }, { "value": "Beach" }] },
              "Rating": { "field_values": [] }
            }
          }
  - name: Curl
    description: |
      Returns the request as a curl command, with placeholders in place of the App ID and Auth Token. It is set before the request is sent, so it also holds a value when Iconik rejects the request; it stays empty when an input check fails first
    type: STRING
    example:
      - name: Curl
        value: |
          curl -X GET \
            -H "App-ID: <your-app-id>" \
            -H "Auth-Token: <your-auth-token>" \
            -H "Content-Type: application/json" \
            -H "Accept: application/json" \
            -L --max-redirs 5 \
            "https://app.iconik.io/API/metadata/v1/assets/7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b/views/0d9e8f7a-6b5c-4d3e-2f1a-0b9c8d7e6f5a/?reencode_values_to_string=false"
connectors:
  - name: Success
    description: |
      Triggered when Iconik returns the metadata values with a 2xx status, including after a rate-limited attempt was retried
  - name: Fail
    description: |
      Triggered when an input check fails or Iconik does not return the values. When an input check fails, nothing is sent to Iconik. Every error Iconik reports is shown as "Iconik returned <status>: <Iconik's error text>"
    causes:
      - name: Invalid Input
        description: |
          If Object ID or View ID is not a UUID, or Object Type has a value that is not one of its options
      - name: Request Rejected
        description: |
          If Iconik answers 400. The message shows Iconik's reason unchanged
      - name: Authentication Failed
        description: |
          If the App ID or Auth Token is empty, or Iconik answers 401 or 403
      - name: Not Found
        description: |
          If the metadata view in View ID does not exist (Iconik answers 404 for the view). The message names the View ID
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

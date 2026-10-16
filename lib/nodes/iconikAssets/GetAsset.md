::wavedoc
---
title: Get Asset
description: |
  The Get Asset node reads one asset from Iconik by its ID, typically as the first step after an Iconik webhook or custom action triggers the stream. It sends a single request and ends on Success when Iconik returns the asset. When Iconik returns a deleted asset, the node also ends on Success; Asset status then shows DELETED, so branch on it if deleted assets must not be processed. The node changes nothing in Iconik. It authenticates with an Iconik App ID and Auth Token; wire both from Get Secret nodes. Iconik requires the can_read_assets role for this request. When Iconik rate-limits the request (429), the node tries again, up to 3 attempts in total.
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
      Enter the ID of the asset, for example from the payload of an Iconik webhook or custom action. It must be a UUID (36 characters with hyphens, upper or lower case); leading and trailing spaces are removed. Any other value fails the node before a request is sent
    type: STRING
    mandatory: true
    example:
      - name: Asset ID
        value: "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b"
  - name: Iconik URL
    description: |
      Enter the base URL of the Iconik instance, starting with http:// or https://. Leave it empty to use https://app.iconik.io, the default. Trailing slashes are removed
    type: STRING
    mandatory: false
    advanced: true
    example:
      - name: Iconik URL
        value: "https://app.iconik.io"
  - name: Include Collections
    description: |
      Enable to ask Iconik for the collections the asset is in; their IDs then appear in the Collection IDs output. Disabled by default
    type: BOOLEAN
    mandatory: false
    advanced: true
    example:
      - name: Include Collections
        value: false
  - name: Include Users
    description: |
      Enable to ask Iconik for details of the users who have interacted with the asset; they appear only in the Asset output. Disabled by default
    type: BOOLEAN
    mandatory: false
    advanced: true
    example:
      - name: Include Users
        value: false
outputs:
  - name: Asset ID
    description: |
      Returns the ID of the asset as Iconik returns it, or the entered Asset ID when the response has none. Stays empty when the node fails
    type: STRING
    example:
      - name: Asset ID
        value: "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b"
  - name: Asset title
    description: |
      Returns the title of the asset. Empty text when Iconik returns no title. Stays empty when the node fails
    type: STRING
    example:
      - name: Asset title
        value: "Summer_Campaign_Final.mov"
  - name: Asset status
    description: |
      Returns the status of the asset as Iconik reports it: ACTIVE, or DELETED for a deleted asset. Stays empty when the node fails
    type: STRING
    example:
      - name: Asset status
        value: "ACTIVE"
  - name: Asset type
    description: |
      Returns the type of the asset as Iconik reports it, one of ASSET, SEQUENCE, NLE_PROJECT, PLACEHOLDER, CUSTOM, LINK or SUBCLIP. Stays empty when the node fails
    type: STRING
    example:
      - name: Asset type
        value: "ASSET"
  - name: Collection IDs
    description: |
      Returns the IDs of the collections the asset is in. An empty list unless Include Collections is enabled. Stays empty when the node fails
    type: STRING_LIST
    example:
      - name: Collection IDs
        value: '["3a1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"]'
  - name: Asset
    description: |
      Returns Iconik's response unchanged: the full asset object, with fields such as id, title, status, type, date_created and date_modified, plus in_collections or the user details when those options are enabled. Stays empty when the node fails
    type: JSON
    example:
      - name: Asset
        value: |
          {
            "id": "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b",
            "title": "Summer_Campaign_Final.mov",
            "status": "ACTIVE",
            "type": "ASSET",
            "date_created": "2026-10-15T10:00:00Z"
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
            "https://app.iconik.io/API/assets/v1/assets/7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b/?include_collections=false&include_users=false"
connectors:
  - name: Success
    description: |
      Triggered when Iconik returns the asset with a 2xx status, including a deleted asset and after a rate-limited attempt was retried
  - name: Fail
    description: |
      Triggered when an input check fails or Iconik does not return the asset. When an input check fails, nothing is sent to Iconik. Every error Iconik reports is shown as "Iconik returned <status>: <Iconik's error text>"
    causes:
      - name: Invalid Input
        description: |
          If Asset ID is not a UUID
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

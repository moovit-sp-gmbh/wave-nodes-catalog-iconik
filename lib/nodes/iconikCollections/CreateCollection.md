::wavedoc
---
title: Create Collection
description: |
  The Create Collection node creates a collection in Iconik, at root level or inside a parent collection, and returns its ID; typically one collection per project or delivery. Iconik allows several collections with the same title, so by default the node first looks for one: it pages through the collections in the same place (the parent's child collections, or all root collections), 100 per request and at most 10,000 in total, and compares the trimmed titles exactly, including upper and lower case, counting only collections with status ACTIVE. What happens on a match is set by If Exists. When there are more than 10,000 collections to check and none of the first 10,000 matches, the node fails instead of creating one, because a duplicate could be among the rest. When a Parent Collection ID is set, the node first checks that the parent exists and is not deleted. Two streams running at the same moment can both find no match and both create a collection, so duplicates are still possible with parallel runs. The node authenticates with an Iconik App ID and Auth Token; wire both from Get Secret nodes. Iconik requires the can_create_collections and can_read_collections roles for these requests. When Iconik rate-limits a request (429), the node tries it again, up to 3 attempts in total.
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
  - name: Collection Title
    description: |
      Enter the title of the collection. Leading and trailing spaces are removed before it is compared and sent; a title that is empty after that fails the node before a request is sent
    type: STRING
    mandatory: true
    example:
      - name: Collection Title
        value: "Campaign Summer 2026"
  - name: Parent Collection ID
    description: |
      Enter the ID of the collection to create the new one in, for example from another Create Collection node. It must be a UUID, and the collection must not be deleted. Leave it empty to create the collection at root level
    type: STRING
    mandatory: false
    example:
      - name: Parent Collection ID
        value: "3a1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"
  - name: If Exists
    description: |
      Choose what happens when an active collection with the same title already exists in the same place. Return Existing is the default
    type: STRING_SELECT
    mandatory: false
    options:
      - name: Return Existing
        description: |
          Returns the existing collection instead of creating one, with Created set to false; when there are several, the oldest among the collections checked
        default: true
      - name: Create New
        description: |
          Creates a new collection without looking for an existing one, even if one with the same title exists
      - name: Fail
        description: |
          Fails the node with "Collection '<title>' already exists" and creates nothing
    example:
      - name: If Exists
        value: "Return Existing"
  - name: External ID
    description: |
      Enter a reference to the collection in an external system, such as a project number. Only sent when a new collection is created; leave it empty to set none
    type: STRING
    mandatory: false
    advanced: true
    example:
      - name: External ID
        value: "PRJ-4711"
  - name: Collection Category
    description: |
      Enter the category of the new collection. Only sent when a new collection is created; leave it empty to set none
    type: STRING
    mandatory: false
    advanced: true
    example:
      - name: Collection Category
        value: "Project"
  - name: Iconik URL
    description: |
      Enter the base URL of the Iconik instance, starting with http:// or https://. Leave it empty to use https://app.iconik.io, the default. Trailing slashes are removed
    type: STRING
    mandatory: false
    advanced: true
    example:
      - name: Iconik URL
        value: "https://app.iconik.io"
  - name: Apply Default ACLs
    description: |
      Enable to give a new collection the default access rights configured in Iconik. Enabled by default; has no effect when an existing collection is returned
    type: BOOLEAN
    mandatory: false
    advanced: true
    example:
      - name: Apply Default ACLs
        value: true
  - name: Apply Collection ACLs
    description: |
      Enable to give a new collection the access rights of its parent collection. Only has an effect when Parent Collection ID is set and a new collection is created. Disabled by default
    type: BOOLEAN
    mandatory: false
    advanced: true
    example:
      - name: Apply Collection ACLs
        value: false
  - name: ACL Template ID
    description: |
      Enter the ID of an Iconik ACL template whose access rights a new collection gets. It must be a UUID; leave it empty to apply no template
    type: STRING
    mandatory: false
    advanced: true
    example:
      - name: ACL Template ID
        value: "9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d"
outputs:
  - name: Collection ID
    description: |
      Returns the ID of the new collection, or of the existing one that was returned. Wire it into Upload File, Add to Collection or List Collection Contents. Stays empty when the node fails
    type: STRING
    example:
      - name: Collection ID
        value: "5c4b3a2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d"
  - name: Collection title
    description: |
      Returns the title of the collection as Iconik returns it. Stays empty when the node fails
    type: STRING
    example:
      - name: Collection title
        value: "Campaign Summer 2026"
  - name: Parent ID
    description: |
      Returns the ID of the parent collection, or empty text for a root-level collection. Stays empty when the node fails
    type: STRING
    example:
      - name: Parent ID
        value: "3a1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"
  - name: Created
    description: |
      Returns true when a new collection was created and false when an existing one was returned. Branch on it when later steps should only run for new collections. Stays empty when the node fails
    type: BOOLEAN
    example:
      - name: Created
        value: true
  - name: Collection
    description: |
      Returns the collection object unchanged, as Iconik returned it from the create request or the lookup, with fields such as id, title, parent_id, status and object_type. Stays empty when the node fails
    type: JSON
    example:
      - name: Collection
        value: |
          {
            "id": "5c4b3a2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d",
            "title": "Campaign Summer 2026",
            "parent_id": "3a1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
            "status": "ACTIVE",
            "object_type": "collections"
          }
  - name: Curl
    description: |
      Returns the last request sent as a curl command, with placeholders in place of the App ID and Auth Token: the create request, or the lookup when an existing collection was returned. It also holds a value when a request fails; it stays empty when an input check fails first
    type: STRING
    example:
      - name: Curl
        value: |
          curl -X POST \
            -H "App-ID: <your-app-id>" \
            -H "Auth-Token: <your-auth-token>" \
            -H "Content-Type: application/json" \
            -H "Accept: application/json" \
            -d '{"title":"Campaign Summer 2026","parent_id":"3a1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"}' \
            -L --max-redirs 5 \
            "https://app.iconik.io/API/assets/v1/collections/?apply_default_acls=true&apply_collection_acls=false"
connectors:
  - name: Success
    description: |
      Triggered when a new collection was created, or, with If Exists set to Return Existing, when an existing one was found and returned
  - name: Fail
    description: |
      Triggered when an input check fails, the parent is deleted, a matching collection exists while If Exists is Fail, or Iconik rejects a request. When an input check fails, nothing is sent to Iconik. Every error Iconik reports is shown as "Iconik returned <status>: <Iconik's error text>"
    causes:
      - name: Invalid Input
        description: |
          If Collection Title is empty, Parent Collection ID or ACL Template ID is set but not a UUID, or If Exists is not one of its options
      - name: Deleted Parent
        description: |
          If the collection in Parent Collection ID has status DELETED
      - name: Too Many to Check
        description: |
          If If Exists is Return Existing or Fail and more than 10,000 collections are in the same place; choose a Parent Collection ID with fewer collections, or set If Exists to Create New
      - name: Already Exists
        description: |
          If If Exists is Fail and an active collection with the same title exists in the same place
      - name: Request Rejected
        description: |
          If Iconik answers 400. The message shows Iconik's reason unchanged
      - name: Authentication Failed
        description: |
          If the App ID or Auth Token is empty, or Iconik answers 401 or 403
      - name: Not Found
        description: |
          If Iconik answers 404, which it documents for a collection that does not exist. When Parent Collection ID is set, the message names it
      - name: Rate Limited
        description: |
          If Iconik still answers 429 on the third attempt of a request. Between attempts the node waits as long as Iconik's Retry-After header says, at most 60 seconds, or 1 second and then 2 seconds when the header is missing
      - name: Connection Error
        description: |
          If the Iconik URL is not a valid http:// or https:// URL, Iconik cannot be reached, or Iconik does not answer within 30 seconds
      - name: Canceled
        description: |
          If the stream is canceled between two pages of the lookup or while the node waits to retry a rate-limited request
      - name: API Error
        description: |
          If Iconik answers with any other non-2xx status
---
::

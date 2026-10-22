from api_gateway.openapi import merge_openapi_specs


def test_merge_openapi_namespaces_duplicate_schemas_and_rewrites_refs() -> None:
    specs = {
        "alpha": {
            "paths": {
                "/v1/alpha": {
                    "get": {
                        "tags": ["alpha"],
                        "responses": {
                            "200": {
                                "content": {
                                    "application/json": {
                                        "schema": {"$ref": "#/components/schemas/Result"}
                                    }
                                }
                            }
                        },
                    }
                }
            },
            "components": {"schemas": {"Result": {"type": "string"}}},
        },
        "beta": {
            "paths": {},
            "components": {"schemas": {"Result": {"type": "integer"}}},
        },
    }

    merged = merge_openapi_specs(specs)

    assert merged["components"]["schemas"]["alpha_Result"] == {"type": "string"}
    assert merged["components"]["schemas"]["beta_Result"] == {"type": "integer"}
    operation = merged["paths"]["/v1/alpha"]["get"]
    schema = operation["responses"]["200"]["content"]["application/json"]["schema"]
    assert schema == {"$ref": "#/components/schemas/alpha_Result"}
    assert merged["security"] == [{"bearerAuth": []}, {"apiKeyAuth": []}]
    assert {tag["name"] for tag in merged["tags"]} == {"alpha"}


def test_merge_openapi_marks_token_and_jwks_as_public() -> None:
    specs = {
        "identity": {
            "paths": {
                "/v1/auth/token": {"post": {"responses": {"200": {}}}},
                "/.well-known/jwks.json": {"get": {"responses": {"200": {}}}},
            },
            "components": {"schemas": {}},
        }
    }

    merged = merge_openapi_specs(specs)

    assert merged["paths"]["/v1/auth/token"]["post"]["security"] == []
    assert merged["paths"]["/.well-known/jwks.json"]["get"]["security"] == []

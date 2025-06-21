# One-liner command to run OSRM wrapper task with custom environment variables

## Full Command (copy and paste):

```bash
aws ecs run-task \
    --cluster "arn:aws:ecs:us-east-2:545009870706:cluster/fleet-mgmt" \
    --task-definition "arn:aws:ecs:us-east-2:545009870706:task-definition/osrm-wrapper:8" \
    --launch-type FARGATE \
    --count 1 \
    --enable-execute-command \
    --network-configuration 'awsvpcConfiguration={subnets=[subnet-09af32d6bff2aa00a],securityGroups=[sg-0131a9212be22a5d6],assignPublicIp=ENABLED}' \
    --overrides '{
        "containerOverrides": [
            {
                "name": "orchestrator",
                "environment": [
                    {
                        "name": "HYPERDECODE_BASE_URL",
                        "value": "https://hyper-decode.amaan.click/hyper-decode-api"
                    },
                    {
                        "name": "SYSTEM_TOKEN",
                        "value": "eyJhbGciOiJIUzI1NiJ9.eyJ0ZW5hbnRJZCI6ImdsaW5udGVjaCIsImlhdCI6MTc1MDA4NTg2MiwiaXNzIjoiaHlwZXJkZWNvZGUiLCJhdWQiOiJoeXBlcmRlY29kZS1hcGkiLCJleHAiOjE3NTAxNzIyNjJ9.9x1PhUIjGnQsHjhru0TKVeXrVo5E0m9Y-RqPyN_SSxM"
                    },
                    {
                        "name": "UPLOAD_TASK_ID",
                        "value": "684f894feb95dc8c021b327c"
                    }
                ]
            }
        ]
    }' \
    --region us-east-2 \
    --profile personal
```

## Capture Task ARN Version:

```bash
TASK_ARN=$(aws ecs run-task \
    --cluster "arn:aws:ecs:us-east-2:545009870706:cluster/fleet-mgmt" \
    --task-definition "arn:aws:ecs:us-east-2:545009870706:task-definition/osrm-wrapper:8" \
    --launch-type FARGATE \
    --count 1 \
    --enable-execute-command \
    --network-configuration 'awsvpcConfiguration={subnets=[subnet-09af32d6bff2aa00a],securityGroups=[sg-0131a9212be22a5d6],assignPublicIp=ENABLED}' \
    --overrides '{
        "containerOverrides": [
            {
                "name": "orchestrator",
                "environment": [
                    {
                        "name": "HYPERDECODE_BASE_URL",
                        "value": "https://hyper-decode.amaan.click/hyper-decode-api"
                    },
                    {
                        "name": "SYSTEM_TOKEN",
                        "value": "eyJhbGciOiJIUzI1NiJ9.eyJ0ZW5hbnRJZCI6ImdsaW5udGVjaCIsImlhdCI6MTc1MDA4NTg2MiwiaXNzIjoiaHlwZXJkZWNvZGUiLCJhdWQiOiJoeXBlcmRlY29kZS1hcGkiLCJleHAiOjE3NTAxNzIyNjJ9.9x1PhUIjGnQsHjhru0TKVeXrVo5E0m9Y-RqPyN_SSxM"
                    },
                    {
                        "name": "UPLOAD_TASK_ID",
                        "value": "684f894feb95dc8c021b327c"
                    }
                ]
            }
        ]
    }' \
    --region us-east-2 \
    --profile personal \
    --query 'tasks[0].taskArn' \
    --output text)

echo "Task ARN: $TASK_ARN"
```

## Environment Variables Included:

- **HYPERDECODE_BASE_URL**: `https://hyper-decode.amaan.click/hyper-decode-api`
- **SYSTEM_TOKEN**: JWT token for authentication (expires: 1750172262)
- **UPLOAD_TASK_ID**: `684f894feb95dc8c021b327c`

## Configuration Details:

- **Cluster**: `arn:aws:ecs:us-east-2:545009870706:cluster/fleet-mgmt`
- **Task Definition**: `osrm-wrapper:8`
- **Launch Type**: FARGATE
- **ECS Execute**: Enabled
- **Subnet**: `subnet-09af32d6bff2aa00a` (single subnet as specified)
- **Security Group**: `sg-0131a9212be22a5d6`
- **Public IP**: Enabled

## Next Steps:

After running the task, use these commands:

```bash
# Wait for task to be running
aws ecs wait tasks-running --cluster "arn:aws:ecs:us-east-2:545009870706:cluster/fleet-mgmt" --tasks "$TASK_ARN" --region us-east-2 --profile personal

# Connect to orchestrator container
aws ecs execute-command --cluster "arn:aws:ecs:us-east-2:545009870706:cluster/fleet-mgmt" --task "$TASK_ARN" --container "orchestrator" --interactive --command "/bin/bash" --region us-east-2 --profile personal
```

# report-group

- SDK Version: 1.0.0
- Execution count: 2

## Model Info
- No model metadata recorded.

## Token Usage Summary
- No token usage recorded.

# exec-1

- Execution start: 2024-03-09T16:00:00.000Z
- Task count: 1

## 1. Tap - Submit
- Task ID: task-1
- Type: Action Space
- SubType: Tap
- Status: finished
- Start: 2024-03-09T16:00:00.000Z
- End: 2024-03-09T16:00:00.100Z
- Cost(ms): 100
- Screen size: 1440 x 900

### Param

```json
{
  "locate": {
    "prompt": "Submit"
  }
}
```

![task-1](./screenshots/execution-1-task-1-shot-exec-1.png)

### Recorder
- #1 type=screenshot, ts=2024-03-09T16:00:00.060Z, timing=record-step-1

![task-1](./screenshots/execution-1-task-1-shot-recorder-exec-1.png)

---

# exec-2

- Execution start: 2024-03-09T16:00:00.200Z
- Task count: 1

## 1. Locate - Submit
- Task ID: task-2
- Type: Action Space
- SubType: Locate
- Status: finished
- Start: 2024-03-09T16:00:00.000Z
- End: 2024-03-09T16:00:00.100Z
- Cost(ms): 100
- Screen size: 1024 x 768
- Locate center: (512, 333)

### Param

```json
{
  "locate": {
    "prompt": "Submit"
  }
}
```

### Output

```json
{
  "element": {
    "center": [
      512,
      333
    ]
  }
}
```

![task-1](./screenshots/execution-2-task-1-shot-exec-2.png)
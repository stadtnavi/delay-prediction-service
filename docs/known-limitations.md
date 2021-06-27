# known limitations

## intermittent sending of bus positions

Sometimes, the buses send their positions intermittently, presumably because they send it via LoRaWAN in a  best-effort manner; Also, even under optimal conditions, each bus sends a position only every ~60 seconds. This means that

- it takes a while until a bus has sent enough positions to be matched (identified to do a certain *run*), and
- sometimes a bus doesn't send enough positions *at all* to certainly match it.

## dwelling at the start/end of a *run*

Because the buses don't send any information whatsoever about the schedule, it is hard to distinguish dwelling as part of a *run* (e.g. because it is waiting at a stop for a train to arrive) from end-of-run dwelling (the bus has finished doing the *run*, now it is dwelling until it starts the next *run*).

For each *run* potentially matching a set of positions, there has been dwelling at the start of the *run*, `delay-prediction-service` will only use the positions after the dwelling to compute the matching score.

## matched *run* can change immediately

Conceptually, `delay-prediction-service`'s matching logic is very simple: Whenever a new bus position arrives (or an interval timer has fired), it tries to match all of the past bus positions with a *run*, regardless of which *run* it has matched them with before; In that regard, it is stateless.

While this keeps the algorithm simpler and avoids nasty edge cases, it also means that bus can be wrongly matched and suddently switch to the correct *run* (or vice-versa).

## planned vehicle positions as an after-though

For two reasons, `delay-prediction-service` considers planned vehicle positions – those based purely on schedule data, not on realtime positions sent by a bus – to be less important:

- Computing vehicle positions from schedule data only provides little value to the customer – `VehiclePositions` provide a false sense of reliability while providing no more information than the timetable.
- During the development process, the requirement to have them came up relatively late, so they're "bolted onto" the code base.

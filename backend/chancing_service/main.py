from fastapi import FastAPI
from pydantic import BaseModel
import os

app = FastAPI()


class ChancingInput(BaseModel):
    gpa: float | None = None
    sat_score: int | None = None
    act_score: int | None = None
    ap_courses: int = 0
    extracurriculars: int = 0
    college_acceptance_rate: float
    college_median_gpa: float | None = None
    college_median_sat: int | None = None
    is_international: bool = True
    intended_major: str | None = None


class ChancingOutput(BaseModel):
    tier: str
    confidence: str
    explanation: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/chance", response_model=ChancingOutput)
def calculate(data: ChancingInput) -> ChancingOutput:
    score = 0.0
    if data.gpa is not None and data.college_median_gpa is not None:
        score += (data.gpa - data.college_median_gpa) * 20
    if data.sat_score is not None and data.college_median_sat is not None:
        score += (data.sat_score - data.college_median_sat) * 0.05

    acceptance = data.college_acceptance_rate or 0.5
    if acceptance < 0.07:
        base = "Reach"
    elif acceptance < 0.25:
        base = "Match" if score >= 0 else "Reach"
    elif acceptance < 0.5:
        base = "Safety" if score >= 0 else "Match"
    else:
        base = "Safety"

    if score < -30:
        tier = "Long Shot"
    elif score < 0:
        tier = "Reach" if base != "Long Shot" else "Long Shot"
    else:
        tier = base

    explanation = (
        "Based on your academic profile versus the school's reported medians. "
        "International applicant pools are typically more competitive."
    )

    return ChancingOutput(tier=tier, confidence="Medium", explanation=explanation)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("CHANCING_PORT", 8001)))

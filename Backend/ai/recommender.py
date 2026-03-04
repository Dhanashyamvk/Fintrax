def generate_recommendation(category, confidence, amount, spent, budget):

    rec = []

    category = category.lower()

    # ---------- CATEGORY CONFIDENCE ----------
    if confidence < 0.6:
        rec.append(
            f"The transaction category prediction is uncertain. Please verify the category for this {category} expense."
        )

    # ---------- NO BUDGET SET ----------
    if budget == 0:
        rec.append(
            f"No budget has been set for {category}. Setting a monthly budget helps control spending."
        )
        return " ".join(rec)

    ratio = spent / budget
    remaining = budget - spent

    # ---------- HEAVY OVERSPENDING ----------
    if ratio > 1.3:
        excess = spent - budget
        rec.append(
            f"⚠ You heavily exceeded your {category} budget by ₹{excess:.2f}. Consider reducing spending in this category immediately."
        )
        rec.append(
            f"Try limiting discretionary purchases related to {category} for the rest of the month."
        )

    # ---------- MODERATE OVERSPENDING ----------
    elif ratio > 1:
        excess = spent - budget
        rec.append(
            f"You exceeded your {category} budget by ₹{excess:.2f}. Monitor your spending to avoid further overspending."
        )

    # ---------- NEAR BUDGET LIMIT ----------
    elif ratio > 0.8:
        rec.append(
            f"You are close to your {category} budget limit. Only ₹{remaining:.2f} remains for this month."
        )

    # ---------- HEALTHY SPENDING ----------
    elif ratio > 0.5:
        rec.append(
            f"Your {category} spending is currently within a healthy range of your budget."
        )

    # ---------- UNDER UTILIZED BUDGET ----------
    elif ratio < 0.3:
        rec.append(
            f"You are spending very little in the {category} category. The allocated budget might be higher than necessary."
        )
        rec.append(
            f"You may consider lowering your {category} budget and allocating funds to more essential categories."
        )

    # ---------- LARGE TRANSACTION ALERT ----------
    if amount > budget * 0.5:
        rec.append(
            f"This {category} transaction is relatively large compared to your monthly budget."
        )

    if amount > budget * 0.8:
        rec.append(
            f"This single {category} transaction consumed a large portion of your monthly budget."
        )

    # ---------- SAVING SUGGESTION ----------
    if ratio < 0.6:
        rec.append(
            f"Maintaining controlled spending in {category} could help increase your monthly savings."
        )

    # ---------- BALANCED SPENDING ----------
    if 0.5 <= ratio <= 0.8:
        rec.append(
            f"Your spending pattern in the {category} category appears balanced and well managed."
        )

    # ---------- FALLBACK ----------
    if not rec:
        rec.append("Your spending behaviour looks balanced overall.")

    return "\n".join(rec)

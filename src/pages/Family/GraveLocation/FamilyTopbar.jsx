function FamilyTopbar({ title = "Grave Location", greeting = "Satellite view of your loved one's burial plot" }) {
  return (
    <header className="fam-topbar">
      <div className="fam-topbar-header">
        <h1 className="fam-topbar-title">{title}</h1>
        {greeting && <p className="fam-topbar-greeting">{greeting}</p>}
      </div>
    </header>
  );
}

export default FamilyTopbar;

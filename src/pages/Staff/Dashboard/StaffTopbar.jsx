function StaffTopbar({ title = "Operational Overview", greeting = "Welcome back, Staff" }) {
  const now = new Date();
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const days   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const dateStr = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;

  return (
    <div className="ds-topbar">
      <div className="ds-topbar-left">
        <h1 className="ds-title">
          {title}
          <span className="ds-title-star">✦</span>
        </h1>
        <p className="ds-greeting">{greeting}</p>
      </div>
      <div className="ds-topbar-right">
        <div className="ds-date-badge">
          <i className="fas fa-calendar-alt"></i>
          {dateStr}
        </div>
      </div>
    </div>
  );
}

export default StaffTopbar;

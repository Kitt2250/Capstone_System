import { useEffect, useState } from "react";
import Table from "../../../components/Table/Table";
import { getUsers } from "../../../services/userServices";
import Header from "../../../components/Header/Header";

function UserManagement() {

    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {

        async function loadUsers() {

            try {
                const data = await getUsers();

                setUsers(data);

            } catch (error) {
                console.error(error);
                setError(error.message);

            } finally {
                setLoading(false);
            }
        }

        loadUsers();

    }, []);


    const columns = [
  
        {
            key: "name",
            label: "Name"
        },
        {
            key: "role",
            label: "Role"
        },
        {
            key: "status",
            label: "Status"
        }
    ];


    if (loading) {
        return <p>Loading users...</p>;
    }

    if (error) {
        return <p>Error: {error}</p>;
    }


    return (
        <div>

            <Header page = "users" />

            <Table
                data={users}
                columns={columns}
            />

        </div>
    );
}


export default UserManagement;
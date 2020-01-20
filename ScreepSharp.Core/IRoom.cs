using ScreepsSharp.Core.RoomObjects;
using System;
using System.Collections.Generic;
using System.Text;

namespace ScreepsSharp.Core
{
    public interface IRoom
    {
        string name { get; }
        
        IController controller { get; }

        IMemory memory { get; }

        IRoomObject[] Find(Find type);

        T[] Find<T>() where T : IRoomObject;

        T[] FindMine<T>() where T : IRoomObject;

        T[] FindHostile<T>() where T : IRoomObject;
    }
}
